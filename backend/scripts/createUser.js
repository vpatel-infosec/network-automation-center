/**
 * Create or update a platform user account.
 *
 *   npm run seed:user -- <email> <password> [name] [role]
 *   npm run seed:user -- virat.patel@nac.local "Passw0rd!" "Virat Patel" admin
 *
 * Passwords containing shell metacharacters are safer passed through the
 * environment: NAC_EMAIL / NAC_PASSWORD / NAC_NAME / NAC_ROLE are used when the
 * matching argument is omitted.
 *
 * Accounts sign in with their email address: the User model has no username
 * field (`username` belongs to the device credential vault). Roles are
 * admin | operator | viewer. If the email already exists the account is
 * updated in place - password reset, name/role applied, account re-activated -
 * which makes this script safe to re-run and useful for recovering access.
 */
import User, { ROLES } from '../src/models/User.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import logger from '../src/utils/logger.js';

const USAGE = 'Usage: npm run seed:user -- <email> <password> [name] [admin|operator|viewer]';

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

async function main() {
  const [, , argEmail, argPassword, argName, argRole] = process.argv;
  const email = String(argEmail || process.env.NAC_EMAIL || '').toLowerCase().trim();
  const password = String(argPassword || process.env.NAC_PASSWORD || '');
  const name = String(argName || process.env.NAC_NAME || email.split('@')[0] || '').trim();
  const role = String(argRole || process.env.NAC_ROLE || 'viewer').toLowerCase().trim();

  if (!email || !password) {
    console.error(USAGE);
    process.exit(1);
  }
  if (!isValidEmail(email)) {
    console.error(`"${email}" is not a valid email address - accounts sign in with their email.`);
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('The password must be at least 8 characters long.');
    process.exit(1);
  }
  if (!ROLES.includes(role)) {
    console.error(`Unknown role "${role}". Expected one of: ${ROLES.join(', ')}.`);
    process.exit(1);
  }

  await connectDb(3);

  const passwordHash = await User.hashPassword(password);
  const existing = await User.findOne({ email });

  if (existing) {
    existing.name = name || existing.name;
    existing.role = role;
    existing.passwordHash = passwordHash;
    existing.active = true;
    await existing.save();
    logger.info(`User "${email}" updated (name=${existing.name}, role=${existing.role}, active)`);
  } else {
    await User.create({ name, email, role, passwordHash, active: true });
    logger.info(`User "${email}" created (name=${name}, role=${role})`);
  }

  await disconnectDb();
  process.exit(0);
}

main().catch(async (error) => {
  logger.error(`User creation failed: ${error.message}`);
  await disconnectDb().catch(() => {});
  process.exit(1);
});
