const crypto = require('crypto');
const mongoose = require('mongoose');
const cleanJson = require('../utils/toJSON');

const transactionSchema = new mongoose.Schema(
  {
    // One transaction per booking: the unique index makes double-charging impossible.
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
    gig: { type: mongoose.Schema.Types.ObjectId, ref: 'Gig', required: true },
    gigTitle: { type: String, required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'ZAR' },
    // completed = money paid in (and still counts as the freelancer's income / platform volume).
    // refunded  = an admin resolved a dispute in the client's favour: the money went back, so it no
    //             longer counts as income, tax-year earnings or platform volume anywhere.
    status: { type: String, enum: ['completed', 'refunded'], default: 'completed' },
    refundedAt: { type: Date, default: null },
    // Payments in this app are simulated: a booking is created and "paid" in the same step, using a
    // demo card form on the frontend (never sent to any real card network). This field documents that
    // rather than implying a real payment processor is involved.
    paymentMethod: { type: String, default: 'simulated' },
    reference: {
      type: String,
      unique: true,
      default: () => `TXN-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
    },
  },
  { timestamps: true }
);

transactionSchema.plugin(cleanJson);

module.exports = mongoose.model('Transaction', transactionSchema);
