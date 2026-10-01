import Job from '../models/Job.js';
import Device from '../models/Device.js';
import Template from '../models/Template.js';
import ConfigVersion from '../models/ConfigVersion.js';
import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';
import config from '../config/env.js';
import runPool from '../utils/asyncPool.js';
import { truncate } from '../drivers/base.js';
import { withDeviceSession } from './deviceConnection.js';
import { renderTemplate } from './templateService.js';
import { backupDevice } from './backupService.js';
import { SECRET_FIELDS } from './credentialService.js';
import { audit } from './auditService.js';
import { emitJobUpdate, emitBroadcast } from '../socketBus.js';

const MAX_OUTPUT = 100000;

const DEFAULT_NAMES = {
  backup: 'Configuration backup',
  command: 'Command execution',
  push_template: 'Template push',
  restore: 'Configuration restore',
};

/** Create the job document (queued). Call startJob() to execute it. */
export async function createJob(payload, user) {
  const type = payload.type;
  if (!['backup', 'command', 'push_template', 'restore'].includes(type)) {
    throw new AppError(`Unsupported job type: ${type}`, 400);
  }

  const doc = new Job({
    name: payload.name || DEFAULT_NAMES[type],
    type,
    trigger: payload.trigger || 'manual',
    devices: payload.deviceIds || [],
    commands: payload.commands || [],
    template: payload.templateId,
    variables: payload.variables || {},
    configVersion: payload.configVersionId,
    options: payload.options || {},
    total: (payload.deviceIds || []).length,
    createdBy: user?._id,
  });

  if (type === 'command' && doc.commands.length === 0) {
    throw new AppError('A command job needs at least one command', 400);
  }
  if (type === 'push_template' && !doc.template) {
    throw new AppError('A template push job needs a template', 400);
  }
  if (type === 'restore') {
    if (!doc.configVersion) throw new AppError('A restore job needs the configuration version to restore', 400);
    const version = await ConfigVersion.findById(doc.configVersion).select('device');
    if (!version) throw new AppError('Configuration version not found', 404);
    doc.devices = [version.device];
    doc.total = 1;
  }
  if (!doc.devices.length) throw new AppError('Select at least one device', 400);

  await doc.save();
  await audit({ user, action: 'job.create', entity: 'job', entityId: doc._id, details: { type, devices: doc.devices.length } });
  return doc;
}

export function jobSnapshot(job) {
  return {
    jobId: String(job._id),
    name: job.name,
    type: job.type,
    status: job.status,
    total: job.total,
    completed: job.completed,
    succeeded: job.succeeded,
    failed: job.failed,
    finishedAt: job.finishedAt,
  };
}

async function recordResult(jobId, result) {
  await Job.updateOne(
    { _id: jobId },
    {
      $push: { results: result },
      $inc: {
        completed: 1,
        succeeded: result.status === 'success' ? 1 : 0,
        failed: result.status === 'failed' ? 1 : 0,
      },
    }
  );
  emitJobUpdate(jobId, { status: 'running', result });
}

/** Fire-and-forget execution: POST /jobs returns immediately with the job id. */
export function startJob(jobId) {
  runJob(jobId).catch((error) => logger.error(`Job ${jobId} crashed: ${error.stack || error.message}`));
}

export async function runJob(jobId) {
  const job = await Job.findById(jobId);
  if (!job || (job.status !== 'queued' && job.status !== 'running')) return;

  job.status = 'running';
  job.startedAt = job.startedAt || new Date();
  await job.save();
  emitJobUpdate(job._id, jobSnapshot(job));
  emitBroadcast('jobs:changed', { jobId: String(job._id), status: job.status });

  try {
    let template = null;
    let version = null;
    if (job.type === 'push_template') {
      template = await Template.findById(job.template);
      if (!template) throw new AppError('Template used by this job no longer exists', 404);
    }
    if (job.type === 'restore') {
      version = await ConfigVersion.findById(job.configVersion);
      if (!version) throw new AppError('Configuration version used by this job no longer exists', 404);
    }

    const deviceDocs = await Device.find({ _id: { $in: job.devices } }).populate({
      path: 'credential',
      select: `name username ${SECRET_FIELDS}`,
    });

    // Devices deleted after the job was created.
    const foundIds = new Set(deviceDocs.map((device) => String(device._id)));
    for (const missingId of job.devices.filter((id) => !foundIds.has(String(id)))) {
      await recordResult(job._id, {
        device: missingId,
        deviceName: '(deleted device)',
        status: 'skipped',
        message: 'Device no longer exists',
        finishedAt: new Date(),
      });
    }

    await runPool(deviceDocs, config.jobConcurrency, async (device) => {
      const fresh = await Job.findById(job._id).select('cancelRequested');
      if (fresh?.cancelRequested) {
        const skipped = {
          device: device._id,
          deviceName: device.name,
          status: 'skipped',
          message: 'Cancelled before start',
          finishedAt: new Date(),
        };
        await recordResult(job._id, skipped);
        return skipped;
      }
      const result = await runOneDevice({ job, device, template, version });
      await recordResult(job._id, result);
      return result;
    });

    const finalJob = await Job.findById(job._id);
    const results = finalJob.results || [];
    const succeeded = results.filter((item) => item.status === 'success').length;
    const failed = results.filter((item) => item.status === 'failed').length;
    const skipped = results.filter((item) => item.status === 'skipped').length;

    let status = 'completed';
    if (failed > 0 && succeeded === 0) status = 'failed';
    else if (failed > 0) status = 'partial';
    else if (skipped > 0) status = 'cancelled';

    finalJob.status = status;
    finalJob.finishedAt = new Date();
    await finalJob.save();
    emitJobUpdate(finalJob._id, jobSnapshot(finalJob));
    emitBroadcast('jobs:changed', { jobId: String(finalJob._id), status });
    await audit({
      action: 'job.finished',
      entity: 'job',
      entityId: finalJob._id,
      details: { type: finalJob.type, status, succeeded, failed, skipped },
    });
    logger.info(`Job ${finalJob._id} (${finalJob.type}) finished: ${status} [ok=${succeeded} failed=${failed} skipped=${skipped}]`);
  } catch (error) {
    job.status = 'failed';
    job.finishedAt = new Date();
    await job.save();
    emitJobUpdate(job._id, jobSnapshot(job));
    emitBroadcast('jobs:changed', { jobId: String(job._id), status: 'failed' });
    logger.error(`Job ${job._id} failed: ${error.message}`);
    await audit({ action: 'job.finished', entity: 'job', entityId: job._id, details: { error: error.message } });
  }
}

/** Execute one job on one device and return its result entry. */
async function runOneDevice({ job, device, template, version }) {
  const startedAt = new Date();
  const base = { device: device._id, deviceName: device.name, startedAt };

  try {
    if (!device.credential) throw new AppError(`Device ${device.name} has no credential assigned`, 400);

    if (job.type === 'backup') {
      const backup = await backupDevice({
        deviceId: device._id,
        user: job.createdBy,
        trigger: job.trigger === 'scheduled' ? 'scheduled' : 'job',
        jobId: job._id,
      });
      return {
        ...base,
        status: 'success',
        message: backup.message,
        changed: backup.changed,
        configVersion: backup.configVersionId,
        finishedAt: new Date(),
      };
    }

    if (job.type === 'command') {
      const outputs = await withDeviceSession(device, device.credential, (session, driver) =>
        driver.runCommands(session, { device }, job.commands)
      );
      const failures = outputs.filter((item) => !item.ok);
      const text = outputs
        .map((item) => `$ ${item.command}\n${item.ok ? item.output : `ERROR: ${item.error}`}`)
        .join('\n\n');
      return {
        ...base,
        status: failures.length ? 'failed' : 'success',
        message: failures.length
          ? `${failures.length}/${outputs.length} command(s) failed`
          : `${outputs.length} command(s) executed`,
        output: truncate(text, MAX_OUTPUT),
        finishedAt: new Date(),
      };
    }

    const content =
      job.type === 'push_template' ? renderTemplate(template, job.variables, device) : version.content;

    const push = await withDeviceSession(device, device.credential, (session, driver) => {
      if (driver.supportsPush === false) {
        throw new AppError(`Driver "${driver.id}" does not support configuration push`, 400);
      }
      return driver.pushConfig(session, { device }, content, { save: job.options?.persist !== false });
    });

    const failed = push.errors.length > 0;
    let message = failed
      ? `${push.errors.length} CLI error(s), first: ${push.errors[0]}`
      : `${push.lineCount} line(s) applied`;
    let configVersion;

    if (!failed && job.options?.backupAfter) {
      try {
        const after = await backupDevice({
          deviceId: device._id,
          user: job.createdBy,
          trigger: job.type === 'restore' ? 'post_restore' : 'post_push',
        });
        message += after.changed
          ? ` · new config v${after.version}`
          : ` · post-check: no change (v${after.version})`;
        configVersion = after.configVersionId;
      } catch (error) {
        message += ` · post-push backup failed: ${error.message}`;
      }
    }

    return {
      ...base,
      status: failed ? 'failed' : 'success',
      message,
      output: truncate(push.output, MAX_OUTPUT),
      configVersion,
      finishedAt: new Date(),
    };
  } catch (error) {
    return { ...base, status: 'failed', message: error.message, finishedAt: new Date() };
  }
}

/** Cooperative cancellation: pending devices are skipped, running ones finish. */
export async function cancelJob(jobId) {
  const job = await Job.findById(jobId);
  if (!job) throw new AppError('Job not found', 404);
  if (job.status !== 'queued' && job.status !== 'running') {
    throw new AppError(`Job is already ${job.status}`, 409);
  }
  job.cancelRequested = true;
  await job.save();
  return job;
}

export default { createJob, startJob, runJob, cancelJob };
