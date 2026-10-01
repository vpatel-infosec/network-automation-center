import AuditLog from '../models/AuditLog.js';
import logger from '../utils/logger.js';

/**
 * Persist an audit trail entry. Never throws: auditing must not break the
 * operation it describes.
 */
export async function audit({ user, action, entity = '', entityId = '', details, ip = '' }) {
  try {
    await AuditLog.create({
      user: user?._id || user?.id || user || undefined,
      userName: user?.name || user?.email || 'system',
      action,
      entity,
      entityId: entityId ? String(entityId) : '',
      details,
      ip,
    });
  } catch (error) {
    logger.error(`Failed to write audit log (${action}): ${error.message}`);
  }
}

export function auditFromRequest(req, action, { entity = '', entityId = '', details } = {}) {
  return audit({
    user: req.user,
    action,
    entity,
    entityId,
    details,
    ip: req.ip,
  });
}

export default audit;
