const Gig = require('../models/Gig');
const Booking = require('../models/Booking');
const Transaction = require('../models/Transaction');
const Review = require('../models/Review');
const { refreshGigRating } = require('../utils/ratings');
const { reviewDeadlineFrom, releaseExpiredEscrows } = require('../utils/escrow');
const { findOrCreateConversation, postPreparedMessage } = require('../services/chatService');
const AppError = require('../utils/AppError');
const { ROLES } = require('../utils/constants');

// Which bookings may this user list? Clients see what they booked, freelancers what
// was booked with them, admins everything.
function scopeFor(user) {
  if (user.role === ROLES.CLIENT) return { client: user.id };
  if (user.role === ROLES.FREELANCER) return { freelancer: user.id };
  return {};
}

const withPeople = (query) => query.populate('client', 'name').populate('freelancer', 'name');

// POST /api/bookings  (client)
// Books the gig and pays for it in the same step: the frontend collects (simulated, never-sent-
// anywhere) demo card details first, then calls this once it's satisfied the card "looks" valid.
// Nothing here trusts that theatre though - the booking and its Transaction are created together
// on the server regardless of what the client claims about a card, exactly as if payment always
// succeeds. That mirrors what a real gateway's webhook would eventually confirm, without needing one.
async function createBooking(req, res, next) {
  try {
    const { gigId, notes = '' } = req.body;

    const gig = await Gig.findById(gigId);
    if (!gig || !gig.isActive) {
      return next(new AppError('This gig is not available for booking.', 404));
    }

    // The price is read from the gig on the server. Whatever amount a client might send is ignored.
    const booking = await Booking.create({
      gig: gig.id,
      gigTitle: gig.title,
      price: gig.price,
      client: req.user.id,
      freelancer: gig.freelancer,
      notes,
    });

    // MongoDB multi-document transactions need a replica set, which most student setups lack, so
    // this is a plain compensating action instead: if writing the Transaction fails for any reason,
    // the just-created Booking is removed rather than left behind half-paid with nothing to show for it.
    let transaction;
    try {
      transaction = await Transaction.create({
        booking: booking.id,
        gig: gig.id,
        gigTitle: gig.title,
        client: req.user.id,
        freelancer: gig.freelancer,
        amount: gig.price,
      });
    } catch (err) {
      await Booking.deleteOne({ _id: booking.id });
      throw err;
    }

    res.status(201).json({
      success: true,
      message: 'Booking confirmed and paid.',
      data: { booking, transaction },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/bookings  (client | freelancer | admin) - role-scoped
async function listBookings(req, res, next) {
  try {
    await releaseExpiredEscrows();
    const bookings = await withPeople(Booking.find(scopeFor(req.user)).sort({ createdAt: -1 }).limit(200));
    res.status(200).json({ success: true, data: { bookings } });
  } catch (err) {
    next(err);
  }
}

// GET /api/bookings/:id  - only the client, the freelancer on it, or an admin
async function getBooking(req, res, next) {
  try {
    await releaseExpiredEscrows();
    const booking = await withPeople(Booking.findById(req.params.id));
    const isParticipant =
      booking &&
      (String(booking.client._id) === req.user.id || String(booking.freelancer._id) === req.user.id);
    // 404 (not 403) for other people's bookings, so booking ids cannot be probed.
    if (!booking || (!isParticipant && req.user.role !== ROLES.ADMIN)) {
      return next(new AppError('Booking not found.', 404));
    }
    res.status(200).json({ success: true, data: { booking } });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/bookings/:id/complete  (freelancer on that booking)
// Marking work done does NOT release the money: it starts the client's review window. Funds move to
// `released` only once the client approves, the window times out, or an admin resolves a dispute.
async function completeBooking(req, res, next) {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, freelancer: req.user.id });
    if (!booking) {
      return next(new AppError('Booking not found.', 404));
    }
    if (booking.status === 'completed') {
      return next(new AppError('This booking is already completed.', 409));
    }
    const now = new Date();
    booking.status = 'completed';
    booking.completedAt = now;
    booking.escrowStatus = 'awaiting_review';
    booking.reviewDeadline = reviewDeadlineFrom(now);
    await booking.save();
    res.status(200).json({ success: true, message: 'Booking marked as completed. The client now has a review window before funds release.', data: { booking } });
  } catch (err) {
    next(err);
  }
}

// POST /api/bookings/:id/release  (the client, while the booking is awaiting their review)
// Lets the client release funds to the freelancer immediately, instead of waiting out the window.
async function releaseEscrow(req, res, next) {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, client: req.user.id });
    if (!booking) {
      return next(new AppError('Booking not found.', 404));
    }
    if (booking.escrowStatus !== 'awaiting_review') {
      return next(new AppError('This booking is not currently awaiting your review.', 409));
    }
    booking.escrowStatus = 'released';
    booking.resolvedAt = new Date();
    await booking.save();
    res.status(200).json({ success: true, message: 'Funds released to the freelancer.', data: { booking } });
  } catch (err) {
    next(err);
  }
}

// POST /api/bookings/:id/dispute  { reason }  (the client, while the booking is awaiting their review)
// Asks for a refund instead of releasing funds: flags the booking for an admin to decide (admin sees it,
// with this same reason, under Disputes - see adminController.listDisputes), and drops the reason into
// the ordinary client/freelancer conversation for this gig, so the freelancer is told why, not just
// left to notice their payout stalled.
async function disputeEscrow(req, res, next) {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, client: req.user.id });
    if (!booking) {
      return next(new AppError('Booking not found.', 404));
    }
    if (booking.escrowStatus !== 'awaiting_review') {
      return next(new AppError('This booking is not currently awaiting your review.', 409));
    }
    // Already escaped by disputeCreateRules (resourceValidators.js) before it reached this controller.
    booking.escrowStatus = 'disputed';
    booking.disputedAt = new Date();
    booking.disputeReason = req.body.reason;
    await booking.save();

    try {
      const conversation = await findOrCreateConversation({
        client: booking.client,
        freelancer: booking.freelancer,
        gig: booking.gig,
        gigTitle: booking.gigTitle,
      });
      await postPreparedMessage({
        conversationId: conversation.id,
        senderId: booking.client,
        text: `Refund requested for &quot;${booking.gigTitle}&quot;: ${booking.disputeReason}`,
      });
    } catch {
      // The dispute itself is already saved and visible to admin either way; a message-thread hiccup
      // (e.g. the conversation unique index racing a near-simultaneous one) should never undo that.
    }

    res.status(200).json({ success: true, message: "We've flagged this for our team to look into. Funds stay held until it's resolved.", data: { booking } });
  } catch (err) {
    next(err);
  }
}

// POST /api/bookings/:id/review  (the client on that booking, once it is completed, once only)
async function reviewBooking(req, res, next) {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, client: req.user.id });
    if (!booking) {
      return next(new AppError('Booking not found.', 404)); // also used for other people's bookings
    }
    if (booking.status !== 'completed') {
      return next(new AppError('You can review a booking once the freelancer marks it as completed.', 409));
    }
    // Rating comes last: only once the money side is actually settled (paid out, or refunded after a
    // dispute), not merely once the work is marked done - while awaiting_review or disputed, the client
    // is still mid-decision (pay vs. ask for refund), not yet reflecting on the finished experience.
    if (!['released', 'refunded'].includes(booking.escrowStatus)) {
      return next(new AppError('You can rate this booking once payment has been settled (paid out or refunded).', 409));
    }
    if (booking.reviewed) {
      return next(new AppError('You have already reviewed this booking.', 409));
    }

    const review = await Review.create({
      booking: booking.id,
      gig: booking.gig,
      freelancer: booking.freelancer,
      client: req.user.id,
      rating: req.body.rating,
      comment: req.body.comment || '',
    });
    booking.reviewed = true;
    await booking.save();
    const gigRating = await refreshGigRating(booking.gig); // if the gig was deleted this simply updates nothing

    res.status(201).json({ success: true, message: 'Thank you for your review.', data: { review, gigRating } });
  } catch (err) {
    next(err); // a duplicate-key race on Review.booking becomes a safe 409
  }
}

// PATCH /api/bookings/:id/issue  { hasOpenIssue: boolean }  - either the client or the freelancer on
// this specific booking (never a stranger, never an unrelated admin action) can flag or clear it.
async function setBookingIssue(req, res, next) {
  try {
    const booking = await withPeople(Booking.findById(req.params.id));
    const isParticipant = booking && (String(booking.client._id) === req.user.id || String(booking.freelancer._id) === req.user.id);
    if (!booking || !isParticipant) {
      return next(new AppError('Booking not found.', 404)); // 404, not 403 - see getBooking's own note above
    }
    booking.hasOpenIssue = req.body.hasOpenIssue;
    await booking.save();
    res.status(200).json({ success: true, data: { booking } });
  } catch (err) {
    next(err);
  }
}

module.exports = { createBooking, listBookings, getBooking, completeBooking, releaseEscrow, disputeEscrow, reviewBooking, setBookingIssue };
