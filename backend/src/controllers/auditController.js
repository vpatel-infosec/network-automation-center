import AuditLog from '../models/AuditLog.js';

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clamp = (value, min, max, fallback) => Math.min(max, Math.max(min, Number(value) || fallback));

export async function list(req, res) {
  const page = clamp(req.query.page, 1, 10000, 1);
  const limit = clamp(req.query.limit, 1, 200, 50);
  const query = {};

  if (req.query.action) query.action = new RegExp(`^${escapeRegex(req.query.action)}`, 'i');
  if (req.query.entity) query.entity = req.query.entity;
  if (req.query.user) query.userName = new RegExp(escapeRegex(req.query.user), 'i');
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i');
    query.$or = [{ action: rx }, { entityId: rx }, { userName: rx }, { entity: rx }];
  }
  if (req.query.from || req.query.to) {
    query.createdAt = {};
    if (req.query.from) query.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) query.createdAt.$lte = new Date(req.query.to);
  }

  const [items, total] = await Promise.all([
    AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name email'),
    AuditLog.countDocuments(query),
  ]);

  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}

/** Distinct action names for the filter dropdown. */
export async function actions(req, res) {
  const items = await AuditLog.distinct('action');
  res.json({ items: items.sort() });
}

export default { list, actions };
