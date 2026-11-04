const mongoose = require('mongoose');
const cleanJson = require('../utils/toJSON');

const BOOKING_STATUSES = ['confirmed', 'completed'];

// The money side of a booking, tracked separately from `status` above (which is about the *work*:
// has the freelancer delivered it yet). This is about the *funds*: who is currently holding them.
//   held            - client paid, platform holds the funds, freelancer may start work
//   awaiting_review - freelancer marked the work completed; the client has a window to review it
//   disputed        - the client flagged a problem within that window; an admin must resolve it
//   released        - funds have gone to the freelancer (approved, timed out, or admin-resolved)
//   refunded        - an admin resolved a dispute in the client's favour
const ESCROW_STATUSES = ['held', 'awaiting_review', 'disputed', 'released', 'refunded'];
const ESCROW_RESOLUTIONS = ['released', 'refunded'];

const bookingSchema = new mongoose.Schema(
  {
    gig: { type: mongoose.Schema.Types.ObjectId, ref: 'Gig', required: true },
    // Snapshots keep booking history readable (and the price fixed) even if the gig is later edited or deleted.
    gigTitle: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    notes: { type: String, trim: true, maxlength: 7000, default: '' },
    status: { type: String, enum: BOOKING_STATUSES, default: 'confirmed' },
    reviewed: { type: Boolean, default: false },
    // Either party can flag a problem with a booking and either party can clear it - this is
    // deliberately not a full support-ticket system, just a shared, visible "something's wrong here"
    // flag; the actual back-and-forth about it happens through "Follow up" (a message to the team).
    hasOpenIssue: { type: Boolean, default: false },

    // ---- escrow: see ESCROW_STATUSES above ----
    escrowStatus: { type: String, enum: ESCROW_STATUSES, default: 'held', index: true },
    completedAt: { type: Date, default: null }, // when the freelancer marked it completed (starts the review window)
    reviewDeadline: { type: Date, default: null }, // funds auto-release to the freelancer once this passes
    disputeReason: { type: String, trim: true, maxlength: 2000, default: '' },
    disputedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null }, // when funds actually moved: released or refunded
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // set only for an admin's dispute resolution
    resolution: { type: String, enum: ESCROW_RESOLUTIONS, default: null },
  },
  { timestamps: true }
);

bookingSchema.plugin(cleanJson);

module.exports = mongoose.model('Booking', bookingSchema);
module.exports.BOOKING_STATUSES = BOOKING_STATUSES;
module.exports.ESCROW_STATUSES = ESCROW_STATUSES;
module.exports.ESCROW_RESOLUTIONS = ESCROW_RESOLUTIONS;
