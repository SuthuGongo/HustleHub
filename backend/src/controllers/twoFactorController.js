const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const TwoFactorCode = require('../models/TwoFactorCode');
const AppError = require('../utils/AppError');
const { comparePassword } = require('../utils/password');
const { signToken, verifyPendingToken } = require('../utils/token');
const { RESEND_COOLDOWN_MS, generateBackupCodes, hashBackupCode } = require('../utils/twoFactor');
const { issueCode, checkCode } = require('../services/otpService');

// GET /api/auth/2fa/status  (authenticated)
async function status(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    res.status(200).json({ success: true, data: { twoFactorEnabled: user.twoFactorEnabled } });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/2fa/enable/request  (authenticated) - sends a code to prove the person can read this inbox
async function requestEnable(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (user.twoFactorEnabled) return next(new AppError('Two-factor authentication is already on.', 409));
    const { maskedEmail, devCode } = await issueCode(user, 'enable');
    res.status(200).json({ success: true, message: 'A verification code has been sent to your email.', data: { maskedEmail, devCode } });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/2fa/enable/confirm  (authenticated)  { code }
async function confirmEnable(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (user.twoFactorEnabled) return next(new AppError('Two-factor authentication is already on.', 409));
    await checkCode(user.id, 'enable', req.body.code);

    const backupCodes = generateBackupCodes();
    user.twoFactorEnabled = true;
    user.twoFactorBackupCodeHashes = backupCodes.map(hashBackupCode);
    await user.save();

    // Backup codes are shown here, once, in the clear - this is the only moment they ever exist outside
    // the person's own records; from now on only their hashes are stored.
    res.status(200).json({ success: true, message: 'Two-factor authentication is now on.', data: { backupCodes } });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/2fa/disable  (authenticated)  { password }  - re-authenticate before turning it off
async function disable(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select('+passwordHash');
    if (!user.twoFactorEnabled) return next(new AppError('Two-factor authentication is already off.', 409));
    const ok = await comparePassword(req.body.password, user.passwordHash);
    if (!ok) return next(new AppError('Incorrect password.', 401));

    user.twoFactorEnabled = false;
    user.twoFactorBackupCodeHashes = undefined;
    await user.save();
    // $in is an operator this code builds itself, not something from user input - see gigController.js
    // and adminController.js for the same pattern, needed because of the sanitizeFilter setting in
    // config/db.js, which otherwise cannot tell a developer-written operator from an injected one.
    await TwoFactorCode.deleteMany({ user: user.id, purpose: mongoose.trusted({ $in: ['login', 'enable'] }) });
    res.status(200).json({ success: true, message: 'Two-factor authentication is now off.' });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/2fa/verify  (public; carries the pending token from login instead of a session token)
// { twoFactorToken, code } or { twoFactorToken, backupCode }
async function verifyLogin(req, res, next) {
  try {
    let decoded;
    try {
      decoded = verifyPendingToken(req.body.twoFactorToken, '2fa');
    } catch {
      return next(new AppError('This verification step has expired. Please log in again.', 401));
    }

    const user = await User.findById(decoded.id).select('+twoFactorBackupCodeHashes');
    if (!user || !user.isActive || !user.twoFactorEnabled) {
      return next(new AppError('This verification step has expired. Please log in again.', 401));
    }

    if (req.body.backupCode) {
      const hash = hashBackupCode(req.body.backupCode);
      const hashes = user.twoFactorBackupCodeHashes || [];
      const index = hashes.findIndex((h) => {
        const a = Buffer.from(h);
        const b = Buffer.from(hash);
        return a.length === b.length && crypto.timingSafeEqual(a, b);
      });
      if (index === -1) return next(new AppError('That backup code is not valid.', 401));
      // Single use: remove it immediately so it can never be replayed.
      user.twoFactorBackupCodeHashes.splice(index, 1);
      await user.save();
    } else {
      await checkCode(user.id, 'login', req.body.code);
    }

    const token = signToken(user);
    res.status(200).json({ success: true, message: 'Login successful.', data: { user: user.toJSON(), token } });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/2fa/resend  (public; carries the pending token)  { twoFactorToken }
async function resend(req, res, next) {
  try {
    let decoded;
    try {
      decoded = verifyPendingToken(req.body.twoFactorToken, '2fa');
    } catch {
      return next(new AppError('This verification step has expired. Please log in again.', 401));
    }
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive || !user.twoFactorEnabled) {
      return next(new AppError('This verification step has expired. Please log in again.', 401));
    }

    const last = await TwoFactorCode.findOne({ user: user.id, purpose: 'login' }).sort({ createdAt: -1 });
    if (last) {
      const waitedMs = Date.now() - last.createdAt.getTime();
      if (waitedMs < RESEND_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((RESEND_COOLDOWN_MS - waitedMs) / 1000);
        res.set('Retry-After', String(retryAfterSeconds));
        // Written directly (not via AppError) so retryAfterSeconds survives the error handler,
        // the same shape the IP-based rate limiter itself uses.
        return res.status(429).json({
          success: false,
          message: `Please wait ${retryAfterSeconds}s before requesting another code.`,
          retryAfterSeconds,
        });
      }
    }

    const { maskedEmail, devCode } = await issueCode(user, 'login');
    res.status(200).json({ success: true, message: 'A new code has been sent.', data: { maskedEmail, devCode } });
  } catch (err) {
    next(err);
  }
}

module.exports = { status, requestEnable, confirmEnable, disable, verifyLogin, resend };
