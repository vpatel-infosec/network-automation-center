import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { signToken } from '../middleware/auth.js';
import { audit, auditFromRequest } from '../services/auditService.js';

/** Tells the login page whether it should offer "create the first admin". */
export async function setupStatus(req, res) {
  const count = await User.estimatedDocumentCount();
  res.json({ needsSetup: count === 0 });
}

/**
 * Creates an account. Open only while the database has no users at all (first
 * run bootstrap, the account always becomes admin); afterwards admin-only.
 */
export async function register(req, res) {
  const { name, email, password, role } = req.body;
  const isFirstUser = (await User.estimatedDocumentCount()) === 0;

  if (!isFirstUser && req.user?.role !== 'admin') {
    throw new AppError('Only an administrator can create accounts', 403);
  }
  if (await User.exists({ email })) {
    throw new AppError('An account with this email already exists', 409);
  }

  const user = new User({
    name,
    email,
    passwordHash: await User.hashPassword(password),
    role: isFirstUser ? 'admin' : role || 'viewer',
  });
  await user.save();
  await audit({
    user: req.user,
    action: 'user.register',
    entity: 'user',
    entityId: user._id,
    details: { email: user.email, role: user.role, bootstrap: isFirstUser },
    ip: req.ip,
  });
  res.status(201).json({ user });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+passwordHash');
  if (!user || !(await user.verifyPassword(password))) {
    throw new AppError('Invalid email or password', 401);
  }
  if (!user.active) throw new AppError('This account is disabled', 403);

  user.lastLoginAt = new Date();
  await user.save();
  await auditFromRequest({ user, ip: req.ip }, 'auth.login', { entity: 'user', entityId: user._id });
  res.json({ token: signToken(user), user });
}

export async function me(req, res) {
  res.json({ user: req.user });
}

export default { setupStatus, register, login, me };
