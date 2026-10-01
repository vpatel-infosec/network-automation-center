import Schedule from '../models/Schedule.js';
import AppError from '../utils/AppError.js';
import { assertCron, reloadSchedule } from '../services/schedulerService.js';
import { audit } from '../services/auditService.js';

export async function list(req, res) {
  const items = await Schedule.find()
    .populate('devices', 'name host')
    .populate('template', 'name')
    .populate('createdBy', 'name')
    .populate('lastJob', 'status name')
    .sort({ name: 1 });
  res.json({ items });
}

export async function get(req, res) {
  const schedule = await Schedule.findById(req.params.id)
    .populate('devices', 'name host')
    .populate('template', 'name');
  if (!schedule) throw new AppError('Schedule not found', 404);
  res.json({ schedule });
}

export async function create(req, res) {
  assertCron(req.body.cron);
  const schedule = await Schedule.create({ ...req.body, createdBy: req.user?._id });
  await reloadSchedule(schedule._id);
  await audit({ user: req.user, action: 'schedule.create', entity: 'schedule', entityId: schedule._id, details: { name: schedule.name, cron: schedule.cron }, ip: req.ip });
  res.status(201).json({ schedule });
}

export async function update(req, res) {
  const schedule = await Schedule.findById(req.params.id);
  if (!schedule) throw new AppError('Schedule not found', 404);
  if (req.body.cron) assertCron(req.body.cron);
  Object.assign(schedule, req.body);
  await schedule.save();
  await reloadSchedule(schedule._id);
  await audit({ user: req.user, action: 'schedule.update', entity: 'schedule', entityId: schedule._id, details: { name: schedule.name, cron: schedule.cron, enabled: schedule.enabled }, ip: req.ip });
  res.json({ schedule });
}

export async function remove(req, res) {
  const schedule = await Schedule.findByIdAndDelete(req.params.id);
  if (!schedule) throw new AppError('Schedule not found', 404);
  await reloadSchedule(req.params.id); // unregister the cron task
  await audit({ user: req.user, action: 'schedule.delete', entity: 'schedule', entityId: schedule._id, details: { name: schedule.name }, ip: req.ip });
  res.json({ success: true });
}

export default { list, get, create, update, remove };
