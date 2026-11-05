// DEMONSTRATION ONLY. Changes the amount of one audit entry directly in the database, the way someone with
// database access (and no access to the application) could, so the "Verify integrity" button on the admin
// Audit trail page can be shown catching it. Run it again with the original amount to put things back.
//
//   npm run demo:tamper-audit -- <entry number> <new amount>
//   npm run demo:tamper-audit -- 2 1
const AuditEntry = require('../src/models/AuditEntry');
const { connectDb, disconnectDb } = require('../src/config/db');

async function main() {
  const seq = Number(process.argv[2]);
  const amount = Number(process.argv[3]);
  if (!Number.isInteger(seq) || seq < 1 || !Number.isFinite(amount)) {
    throw new Error('Usage: npm run demo:tamper-audit -- <entry number> <new amount>');
  }
  await connectDb();
  // The raw collection is used on purpose: it skips the application entirely, which is the point.
  const before = await AuditEntry.collection.findOne({ seq });
  if (!before) throw new Error(`There is no audit entry number ${seq}.`);
  await AuditEntry.collection.updateOne({ seq }, { $set: { amount } });
  console.log(`Entry ${seq} (${before.event}): amount changed from ${before.amount} to ${amount}. Its stored hash was not touched.`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(disconnectDb);
