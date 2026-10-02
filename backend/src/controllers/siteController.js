import Site from '../models/Site.js';
import AppError from '../utils/AppError.js';
import { audit } from '../services/auditService.js';

export async function listSites(req, res) {
  const sites = await Site.find().sort({ name: 1 });
  res.json({ items: sites });
}

export async function createSite(req, res) {
  const { name, code, description, address, region, active } = req.body;
  const siteName = String(name || '').trim();
  const siteCode = String(code || '').trim();

  if (!siteName) throw new AppError('Site name is required', 400);
  if (await Site.exists({ name: siteName })) throw new AppError('A site with this name already exists', 409);
  if (siteCode && (await Site.exists({ code: siteCode }))) throw new AppError('A site with this code already exists', 409);

  const site = new Site({
    name: siteName,
    code: siteCode,
    description: String(description || '').trim(),
    address: String(address || '').trim(),
    region: String(region || '').trim(),
    active: active !== false,
  });

  await site.save();
  await audit({
    user: req.user,
    action: 'site.create',
    entity: 'site',
    entityId: site._id,
    details: { name: site.name, code: site.code },
    ip: req.ip,
  });

  res.status(201).json({ site });
}

export async function updateSite(req, res) {
  const site = await Site.findById(req.params.id);
  if (!site) throw new AppError('Site not found', 404);

  const { name, code, description, address, region, active } = req.body;
  if (name !== undefined) site.name = String(name).trim();
  if (code !== undefined) site.code = String(code).trim();
  if (description !== undefined) site.description = String(description).trim();
  if (address !== undefined) site.address = String(address).trim();
  if (region !== undefined) site.region = String(region).trim();
  if (active !== undefined) site.active = Boolean(active);

  await site.save();
  await audit({
    user: req.user,
    action: 'site.update',
    entity: 'site',
    entityId: site._id,
    details: { name: site.name, code: site.code, active: site.active },
    ip: req.ip,
  });

  res.json({ site });
}

export async function deleteSite(req, res) {
  const site = await Site.findById(req.params.id);
  if (!site) throw new AppError('Site not found', 404);

  await site.deleteOne();
  await audit({
    user: req.user,
    action: 'site.delete',
    entity: 'site',
    entityId: site._id,
    details: { name: site.name },
    ip: req.ip,
  });

  res.json({ success: true });
}

export default { listSites, createSite, updateSite, deleteSite };
