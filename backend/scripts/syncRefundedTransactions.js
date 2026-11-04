// One-off data fix for databases created before refunds were tracked on the payment record.
//
// Before this change, an admin refunding a disputed booking marked the BOOKING as refunded but left
// its Transaction as "completed", so the freelancer's income overview kept counting money that had
// already gone back to the client. This brings older data in line: every booking that was refunded
// gets its Transaction marked refunded too. Safe to run any number of times.
//
//   npm run sync:refunds
const Booking = require('../src/models/Booking');
const Transaction = require('../src/models/Transaction');
const { connectDb, disconnectDb } = require('../src/config/db');

async function main() {
  await connectDb();
  const refunded = await Booking.find({ escrowStatus: 'refunded' }).select('_id resolvedAt');
  let fixed = 0;
  for (const booking of refunded) {
    const result = await Transaction.updateOne(
      { booking: booking._id, status: 'completed' },
      { $set: { status: 'refunded', refundedAt: booking.resolvedAt || new Date() } }
    );
    fixed += result.modifiedCount;
  }
  console.log(`Checked ${refunded.length} refunded booking(s); corrected ${fixed} payment record(s).`);
  await disconnectDb();
}

main().catch(async (err) => {
  console.error('Sync failed:', err.message);
  await disconnectDb().catch(() => {});
  process.exit(1);
});
