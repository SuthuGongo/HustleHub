const mongoose = require('mongoose');
const cleanJson = require('../utils/toJSON');
const { ROLES } = require('../utils/constants');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 700 }, // stored HTML-escaped, so allow headroom
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    // select:false => the hash is only loaded when a query explicitly asks for it (login).
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), required: true },
    isActive: { type: Boolean, default: true },
    // A new account starts unverified; login is blocked until the emailed code is confirmed.
    emailVerified: { type: Boolean, default: false },
    // ---- two-factor authentication (email OTP) ----
    twoFactorEnabled: { type: Boolean, default: false },
    // One-time backup codes, each hashed (never stored in the clear), each usable once.
    twoFactorBackupCodeHashes: { type: [String], default: undefined, select: false },
  },
  { timestamps: true }
);

userSchema.plugin(cleanJson);

module.exports = mongoose.model('User', userSchema);
