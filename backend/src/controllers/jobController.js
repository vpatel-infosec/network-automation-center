import Job from '../models/Job.js';
import AppError from '../utils/AppError.js';
import { createJob, startJob, cancelJob } from '../services/jobService.js';
import { audit } from '../services/auditService.js';

const clamp = (value, min, max, fallback) => Math.min(max, Math.max(min, Number(value) || fallback));

export async function list(req, res) {
  const page = clamp(req.query.page, 1, 10000, 1);
  const limit = clamp(req.query.limit, 1, 200, 25);
  const query = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.type) query.type = req.query.type;

  const [items, total] = await Promise.all([
    Job.find(query)
      .select('-results.output')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Job.countDocuments(query),
  ]);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}

export async function get(req, res) {
  const job = await Job.findById(req.params.id)
    .populate('createdBy', 'name')
    .populate('devices', 'name host vendor deviceType')
    .populate('template', 'name');
  if (!job) throw new AppError('Job not found', 404);
  res.json({ job });
}

/** Manual jobs from the UI: type=backup or type=command. */
export async function create(req, res) {
  const job = await createJob(
    {
      type: req.body.type,
      name: req.body.name,
      deviceIds: req.body.deviceIds,
      commands: req.body.commands,
      options: req.body.options,
    },
    req.user
  );
  startJob(job._id);
  res.status(202).json({ job });
}

export async function cancel(req, res) {
  const job = await cancelJob(req.params.id);
  await audit({ user: req.user, action: 'job.cancel', entity: 'job', entityId: job._id, ip: req.ip });
  res.json({ job });
}

export default { list, get, create, cancel };
