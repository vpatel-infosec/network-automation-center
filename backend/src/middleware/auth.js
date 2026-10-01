import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import AppError from '../utils/AppError.js';
import User from '../models/User.js';

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export async function requireAuth(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) throw new AppError('Authentication required', 401);
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new AppError('Invalid or expired session, please sign in again', 401);
    }
    const user = await User.findById(payload.sub);
    if (!user || !user.active) throw new AppError('Account not found or disabled', 401);
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

/** Used by /auth/register so the first-run bootstrap can create the admin. */
export async function optionalAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.sub);
    if (user && user.active) req.user = user;
  } catch {
    /* ignore invalid token here; requireAuth rejects when it matters */
  }
  return next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError('Authentication required', 401));
    if (!roles.includes(req.user.role)) {
      return next(new AppError(`This action requires role: ${roles.join(' or ')}`, 403));
    }
    return next();
  };
}

export const requireOperator = requireRole('admin', 'operator');
export const requireAdmin = requireRole('admin');

export default { signToken, requireAuth, optionalAuth, requireRole, requireOperator, requireAdmin };
