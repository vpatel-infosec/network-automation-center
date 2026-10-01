import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { audit } from '../services/auditService.js';

async function countActiveAdmins() {
  return User.countDocuments({ role: 'admin', active: true });
}

export async function listUsers(req, res) {
  const users = await User.find().sort({ name: 1 });
  res.json({ items: users });
}

export async function createUser(req, res) {
  const { name, email, password, role, active } = req.body;
  if (await User.exists({ email })) throw new AppError('An account with this email already exists', 409);
  const user = new User({
    name,
    email,
    passwordHash: await User.hashPassword(password),
    role: role || 'viewer',
    active: active !== false,
  });
  await user.save();
  await audit({ user: req.user, action: 'user.create', entity: 'user', entityId: user._id, details: { email, role: user.role }, ip: req.ip });
  res.status(201).json({ user });
}

export async function updateUser(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);

  const { name, email, role, active, password } = req.body;
  const losingAdmin =
    user.role === 'admin' && ((role && role !== 'admin') || active === false) && (await countActiveAdmins()) <= 1;
  if (losingAdmin) throw new AppError('The last active administrator cannot be demoted or disabled', 409);

  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  if (role !== undefined) user.role = role;
  if (active !== undefined) user.active = active;
  if (password) user.passwordHash = await User.hashPassword(password);
  await user.save();

  await audit({ user: req.user, action: 'user.update', entity: 'user', entityId: user._id, details: { role: user.role, active: user.active }, ip: req.ip });
  res.json({ user });
}

export async function deleteUser(req, res) {
  const target = await User.findById(req.params.id);
  if (!target) throw new AppError('User not found', 404);
  if (String(target._id) === String(req.user._id)) {
    throw new AppError('You cannot delete your own account', 400);
  }
  if (target.role === 'admin' && (await countActiveAdmins()) <= 1) {
    throw new AppError('The last active administrator cannot be deleted', 409);
  }
  await target.deleteOne();
  await audit({ user: req.user, action: 'user.delete', entity: 'user', entityId: target._id, details: { email: target.email }, ip: req.ip });
  res.json({ success: true });
}

export default { listUsers, createUser, updateUser, deleteUser };
