/**
 * Creates (or resets) an administrator account.
 *
 *   npm run seed:admin -- admin@example.com "StrongPassw0rd!" "Jane Doe"
 *
 * Falls back to ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME from .env when the
 * command line arguments are omitted. Useful for production bootstrap and for
 * recovering access when the only admin account is locked out.
 */
import config from '../src/config/env.js';
import User from '../src/models/User.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import logger from '../src/utils/logger.js';

async function main() {
  const [, , argEmail, argPassword, argName] = process.argv;
  const email = String(argEmail || config.admin.email || '').toLowerCase().trim();
  const password = argPassword || config.admin.password;
  const name = argName || config.admin.name;

  if (!email || !password) {
    console.error('Usage: npm run seed:admin -- <email> <password> [name]');
    console.error('   or: set ADMIN_EMAIL / ADMIN_PASSWORD in backend/.env and run npm run seed:admin');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('The password must be at least 8 characters long.');
    process.exit(1);
  }

  await connectDb(3);

  const existing = await User.findOne({ email });
  if (existing) {
    existing.name = name || existing.name;
    existing.passwordHash = await User.hashPassword(password);
    existing.role = 'admin';
    existing.active = true;
    await existing.save();
    logger.info(`Administrator "${email}" updated (password reset, role=admin, active)`);
  } else {
    await User.create({
      name,
      email,
      passwordHash: await User.hashPassword(password),
      role: 'admin',
      active: true,
    });
    logger.info(`Administrator "${email}" created`);
  }

  await disconnectDb();
  process.exit(0);
}

main().catch(async (error) => {
  logger.error(`Seeding failed: ${error.message}`);
  await disconnectDb().catch(() => {});
  process.exit(1);
});
