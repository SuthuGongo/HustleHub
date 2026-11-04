const User = require('../models/User');
const TwoFactorCode = require('../models/TwoFactorCode');
const AppError = require('../utils/AppError');
const { hashPassword, dummyCompare } = require('../utils/password');
const { issueCode, checkCode } = require('../services/otpService');

// A single, constant wording used whether the email doesn't exist, the account is disabled, or the
// code is simply wrong - so a person probing the endpoint learns nothing about which case occurred.
const GENERIC_SENT_MESSAGE = 'If an account exists for that email address, a reset code has been sent.';
const GENERIC_FAILURE_MESSAGE = 'That code is not valid or has expired.';

// POST /api/auth/forgot-password  (public)  { email }
// Deliberately returns the exact same response, in roughly the same time, whether or not the email
// is registered - a differing response (or a fast vs. slow one) would let someone enumerate accounts.
async function forgotPassword(req, res, next) {
  try {
    const email = req.body.email;
    const user = await User.findOne({ email });

    if (user && user.isActive) {
      await issueCode(user, 'reset_password');
    } else {
      await dummyCompare('timing-equaliser'); // burn roughly the same time as issueCode's hashing work
    }

    res.status(200).json({ success: true, message: GENERIC_SENT_MESSAGE });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/reset-password  (public)  { email, code, newPassword }
// No pending token here on purpose: unlike login-2FA or email verification (which follow directly
// from an action the person just took, so a token can be handed back safely), a forgotten-password
// flow may be picked up much later from an email, by someone who never made the original request -
// re-checking the email + code together each time avoids relying on anything issued earlier in the
// same request/response, which is exactly what forgotPassword() must never do (see above).
async function resetPassword(req, res, next) {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user || !user.isActive) {
      // Same message as a wrong code: whether the email doesn't exist or the code is wrong is not
      // something the caller gets to distinguish.
      await dummyCompare('timing-equaliser');
      return next(new AppError(GENERIC_FAILURE_MESSAGE, 401));
    }

    try {
      await checkCode(user.id, 'reset_password', req.body.code);
    } catch (err) {
      // Re-word checkCode's own (accurate, attempt-counting) message as the same generic failure,
      // so this endpoint never confirms an email is registered just because the code checking logic ran.
      return next(new AppError(err.statusCode === 401 ? GENERIC_FAILURE_MESSAGE : err.message, err.statusCode || 401));
    }

    user.passwordHash = await hashPassword(req.body.newPassword);
    await user.save();
    await TwoFactorCode.deleteMany({ user: user.id, purpose: 'reset_password' });

    // No auto-login: the person must sign in again with the new password, which is worth the small
    // extra step for a security-sensitive account-recovery flow like this one.
    res.status(200).json({ success: true, message: 'Your password has been changed. Please log in.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { forgotPassword, resetPassword };
