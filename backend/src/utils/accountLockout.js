const User = require('../models/User');
const { security } = require('../config/env');
const logger = require('./logger');

// Per-account lockout. The rate limiters count requests per IP address, so an attacker who changes address
// (or a botnet) can keep guessing one person's password. This counts failures per ACCOUNT instead:
// after `lockoutMaxAttempts` wrong passwords in a row the account refuses logins for `lockoutMinutes`,
// even for the correct password, so guessing stops being worth it.

function isLocked(user, now = Date.now()) {
  return Boolean(user && user.lockUntil && user.lockUntil.getTime() > now);
}

function minutesLeft(user, now = Date.now()) {
  return Math.max(1, Math.ceil((user.lockUntil.getTime() - now) / 60000));
}

// Records one wrong password. The counter is increased inside the database ($inc), not read, changed and
// written back, so two guesses arriving at the same moment are both counted and cannot slip past the limit.
// Returns true when this failure locked the account.
async function registerFailure(user, context = {}) {
  await User.updateOne({ _id: user._id }, { $inc: { failedLoginCount: 1 } });
  const updated = await User.findById(user._id).select('+failedLoginCount');
  if (!updated || updated.failedLoginCount < security.lockoutMaxAttempts) return false;

  const lockUntil = new Date(Date.now() + security.lockoutMinutes * 60000);
  await User.updateOne({ _id: user._id }, { $set: { lockUntil, failedLoginCount: 0 } });
  logger.warn('security.account_locked', {
    userId: user.id,
    minutes: security.lockoutMinutes,
    ip: context.ip,
    requestId: context.requestId,
  });
  return true;
}

// A correct password (or a completed password reset, which proves control of the email address) clears the record.
async function clearFailures(user) {
  await User.updateOne({ _id: user._id }, { $set: { failedLoginCount: 0, lockUntil: null } });
}

module.exports = { isLocked, minutesLeft, registerFailure, clearFailures };
