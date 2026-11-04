const mongoose = require('mongoose');
const cleanJson = require('../utils/toJSON');

// A review can only exist for a completed booking, is written by the client on it, and there is at most one per booking.
const reviewSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
    gig: { type: mongoose.Schema.Types.ObjectId, ref: 'Gig', required: true, index: true },
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
    comment: { type: String, trim: true, maxlength: 7000, default: '' }, // stored HTML-escaped
  },
  { timestamps: true }
);

reviewSchema.plugin(cleanJson);

module.exports = mongoose.model('Review', reviewSchema);
