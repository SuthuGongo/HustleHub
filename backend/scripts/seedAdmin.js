// Creates the first administrator account.
// Admins cannot register through the public API (that would be a privilege-escalation hole),
// so they are created here, from environment variables, by someone with server access.
//
//   ADMIN_EMAIL=admin@hustlehub.local ADMIN_PASSWORD='Str0ng-Password-123' npm run seed:admin
const User = require('../src/models/User');
const { connectDb, disconnectDb } = require('../src/config/db');
const { hashPassword } = require('../src/utils/password');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function main() {
  const name = process.env.ADMIN_NAME || 'Platform Admin';
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!EMAIL_PATTERN.test(email)) throw new Error('ADMIN_EMAIL is missing or not a valid email address.');
  if (password.length < 12 || !/\d/.test(password) || !/[A-Z]/.test(password)) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters and include an uppercase letter and a number.');
  }
  if (password.startsWith('change_me')) throw new Error('ADMIN_PASSWORD is still the placeholder from .env.example.');

  await connectDb();

  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role === 'admin') {
      // Self-healing rather than a silent no-op: an admin created by an older version of this script
      // (before emailVerified existed, for example) should not be left permanently unable to log in
      // just because it already existed. Running this script always leaves the account in the same
      // state a fresh run would have produced.
      if (!existing.emailVerified || !existing.isActive) {
        existing.emailVerified = true;
        existing.isActive = true;
        await existing.save();
        console.log(`Admin ${email} already existed and has been brought up to date (verified, active).`);
      } else {
        console.log(`Admin ${email} already exists. Nothing to do.`);
      }
    } else {
      throw new Error(`A ${existing.role} account already uses ${email}. Choose a different ADMIN_EMAIL.`);
    }
  } else {
    // Provisioned directly by whoever runs this script (server/deploy access), not through public
    // registration, so there is no "prove you own this inbox" step to complete: mark it verified now.
    await User.create({ name, email, passwordHash: await hashPassword(password), role: 'admin', emailVerified: true });
    console.log(`Admin account created for ${email}.`);
  }

  await disconnectDb();
}

main().catch(async (err) => {
  console.error('Seeding failed:', err.message);
  try { await disconnectDb(); } catch { /* ignore */ }
  process.exit(1);
});
