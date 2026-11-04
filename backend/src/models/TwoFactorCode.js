const mongoose = require('mongoose');
const { TWO_FACTOR_PURPOSES } = require('../utils/constants');

// A pending email one-time code. The code itself is never stored: only a salted hash of it,
// so a database read alone can never reveal (or let someone reuse) a live code.
const twoFactorCodeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    purpose: { type: String, enum: TWO_FACTOR_PURPOSES, required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 }, // wrong guesses against this code
    consumedAt: { type: Date, default: null }, // set once the code has been used successfully
  },
  { timestamps: true }
);

// A code is only ever looked up by (user, purpose). Expiry is always checked in application code
// (see checkCode() in twoFactorController.js), so a MongoDB TTL index here is an optional extra for
// production housekeeping, not something correctness depends on - useful to add once deployed on
// real MongoDB, but left out here so the model works identically on any MongoDB-compatible database.
twoFactorCodeSchema.index({ user: 1, purpose: 1 });

module.exports = mongoose.model('TwoFactorCode', twoFactorCodeSchema);
