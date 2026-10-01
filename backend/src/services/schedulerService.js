import cron from 'node-cron';
import Schedule from '../models/Schedule.js';
import Job from '../models/Job.js';
import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';
import { startJob } from './jobService.js';
import { audit } from './auditService.js';

/** scheduleId -> cron task */
const tasks = new Map();

export function validateCron(expression) {
  return cron.validate(String(expression || ''));
}

export function assertCron(expression) {
  if (!validateCron(expression)) {
    throw new AppError(`Invalid cron expression "${expression}". Use standard 5-field cron, e.g. "0 2 * * *".`, 400);
  }
}

async function handleTick(scheduleId) {
  let schedule = null;
  try {
    schedule = await Schedule.findById(scheduleId);
    if (!schedule || !schedule.enabled) return;

    if (!schedule.devices?.length) throw new AppError('Schedule has no devices', 400);
    if (schedule.type === 'push_template' && !schedule.template) {
      throw new AppError('Template push schedule has no template', 400);
    }

    const job = await Job.create({
      name: `${schedule.type === 'backup' ? 'Scheduled backup' : 'Scheduled template push'}: ${schedule.name}`,
      type: schedule.type,
      trigger: 'scheduled',
      devices: schedule.devices,
      template: schedule.template,
      variables: schedule.variables || {},
      options: schedule.options || {},
      total: schedule.devices.length,
      createdBy: schedule.createdBy,
    });

    schedule.lastRunAt = new Date();
    schedule.lastJob = job._id;
    schedule.lastStatus = 'queued';
    await schedule.save();

    logger.info(`Schedule "${schedule.name}" triggered job ${job._id}`);
    startJob(job._id);
  } catch (error) {
    logger.error(`Schedule "${schedule.name || scheduleId}" failed: ${error.message}`);
    if (schedule) {
      schedule.lastRunAt = new Date();
      schedule.lastStatus = `error: ${error.message}`.slice(0, 300);
      await schedule.save().catch(() => {});
    }
    await audit({ action: 'schedule.error', entity: 'schedule', entityId: scheduleId, details: { error: error.message } });
  }
}

function register(schedule) {
  const key = String(schedule._id);
  const existing = tasks.get(key);
  if (existing) {
    try { existing.stop(); } catch { /* noop */ }
    tasks.delete(key);
  }
  if (!schedule.enabled) return;
  if (!validateCron(schedule.cron)) {
    logger.error(`Schedule "${schedule.name}" skipped: invalid cron "${schedule.cron}"`);
    return;
  }
  const options = schedule.timezone ? { timezone: schedule.timezone } : undefined;
  const task = cron.schedule(schedule.cron, () => handleTick(key), options);
  tasks.set(key, task);
}

/** (Re)register one schedule after create/update/toggle. */
export async function reloadSchedule(scheduleId) {
  const schedule = await Schedule.findById(scheduleId);
  if (!schedule) {
    const task = tasks.get(String(scheduleId));
    if (task) {
      try { task.stop(); } catch { /* noop */ }
      tasks.delete(String(scheduleId));
    }
    return null;
  }
  register(schedule);
  return schedule;
}

export async function reloadAll() {
  for (const task of tasks.values()) {
    try { task.stop(); } catch { /* noop */ }
  }
  tasks.clear();
  const schedules = await Schedule.find({ enabled: true });
  schedules.forEach(register);
  logger.info(`Scheduler started: ${tasks.size} active schedule(s)`);
}

export function stopAll() {
  for (const task of tasks.values()) {
    try { task.stop(); } catch { /* noop */ }
  }
  tasks.clear();
}

export default { validateCron, assertCron, reloadSchedule, reloadAll, stopAll };
