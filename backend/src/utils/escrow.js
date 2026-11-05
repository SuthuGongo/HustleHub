const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const audit = require('../services/auditTrail');

// How long a client has to review completed work before funds auto-release to the freelancer.
// Configurable via .env so a real 3-day window can be shrunk to a few minutes for demos and
// testing, without touching any code. Falls back to 72 hours (3 days) if unset or invalid.
const REVIEW_WINDOW_HOURS = Number(process.env.REVIEW_WINDOW_HOURS) > 0 ? Number(process.env.REVIEW_WINDOW_HOURS) : 72;

function reviewDeadlineFrom(from = new Date()) {
  return new Date(from.getTime() + REVIEW_WINDOW_HOURS * 60 * 60 * 1000);
}

// There is no background worker/cron in this project, so "auto-release after 3 days" is implemented
// lazily instead: any booking whose review window has quietly expired is flipped to `released` the
// next time anyone reads bookings (their own list, a single booking, or an admin view). Cheap, and
// correct by the time anyone actually looks - which is all "the funds released while I wasn't
// looking" needs to mean here.
async function releaseExpiredEscrows() {
  // $lte is an operator we built ourselves, not from user input - see gigController.js for the same
  // pattern. Without mongoose.trusted(), the global sanitizeFilter setting (config/db.js) re-wraps it in
  // `{ $eq: { $lte: ... } }` to guard against injected filters, which then fails to cast against the Date type.
  const due = { escrowStatus: 'awaiting_review', reviewDeadline: mongoose.trusted({ $lte: new Date() }) };
  const expired = await Booking.find(due).select('price').lean(); // remembered so each release can go in the audit trail
  if (!expired.length) return;
  await Booking.updateMany(
    { _id: mongoose.trusted({ $in: expired.map((b) => b._id) }), escrowStatus: 'awaiting_review' },
    { $set: { escrowStatus: 'released', resolvedAt: new Date() } }
  );
  for (const b of expired) {
    await audit.append('funds.released', { bookingId: b._id, amount: b.price, note: 'review window expired, released automatically' });
  }
}

module.exports = { REVIEW_WINDOW_HOURS, reviewDeadlineFrom, releaseExpiredEscrows };
