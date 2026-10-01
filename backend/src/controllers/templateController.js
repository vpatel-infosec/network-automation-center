import Device from '../models/Device.js';
import AppError from '../utils/AppError.js';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  renderTemplate,
} from '../services/templateService.js';
import { createJob, startJob } from '../services/jobService.js';
import { audit } from '../services/auditService.js';

export async function list(req, res) {
  res.json({ items: await listTemplates() });
}

export async function get(req, res) {
  res.json({ template: await getTemplate(req.params.id) });
}

export async function create(req, res) {
  const template = await createTemplate(req.body, req.user);
  await audit({ user: req.user, action: 'template.create', entity: 'template', entityId: template._id, details: { name: template.name }, ip: req.ip });
  res.status(201).json({ template });
}

export async function update(req, res) {
  const template = await updateTemplate(req.params.id, req.body);
  await audit({ user: req.user, action: 'template.update', entity: 'template', entityId: template._id, details: { name: template.name }, ip: req.ip });
  res.json({ template });
}

export async function remove(req, res) {
  const template = await deleteTemplate(req.params.id);
  await audit({ user: req.user, action: 'template.delete', entity: 'template', entityId: template._id, details: { name: template.name }, ip: req.ip });
  res.json({ success: true });
}

/** Render without pushing (optionally against a real device's context). */
export async function preview(req, res) {
  const template = await getTemplate(req.params.id);
  let device = null;
  if (req.body?.deviceId) {
    device = await Device.findById(req.body.deviceId);
    if (!device) throw new AppError('Device not found', 404);
  }
  const rendered = renderTemplate(template, req.body?.variables || {}, device);
  res.json({ rendered });
}

/** Create + start a push_template job for the selected devices. */
export async function push(req, res) {
  const template = await getTemplate(req.params.id);
  const job = await createJob(
    {
      type: 'push_template',
      name: req.body?.name || `Push "${template.name}"`,
      templateId: template._id,
      deviceIds: req.body?.deviceIds || [],
      variables: req.body?.variables || {},
      options: req.body?.options || {},
    },
    req.user
  );
  template.lastUsedAt = new Date();
  await template.save();
  await audit({ user: req.user, action: 'template.push', entity: 'template', entityId: template._id, details: { jobId: job._id, devices: job.devices.length }, ip: req.ip });
  startJob(job._id);
  res.status(202).json({ job });
}

export default { list, get, create, update, remove, preview, push };
