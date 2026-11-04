const User = require('../models/User');
const AppError = require('../utils/AppError');
const { signToken, signPendingToken, verifyPendingToken } = require('../utils/token');
const { RESEND_COOLDOWN_MS } = require('../utils/twoFactor');
const TwoFactorCode = require('../models/TwoFactorCode');
const { issueCode, checkCode, testRunCode } = require('../services/otpService');

// Shared by register() in authController and by resendVerification() below: creates the pending
// token + emailed code pair that stands in for "you are registered, but not fully logged in yet".
// devCode from issueCode() is deliberately dropped here, not forwarded to either caller: without real
// SMTP configured, the code still reaches the person via the server's own console log (see mailer.js),
// the same way a forgotten-password code does, rather than ever being shown back in the browser.
async function startVerification(user) {
  const { maskedEmail, devCode } = await issueCode(user, 'verify_email');
  return { verifyToken: signPendingToken(user, 'verify_email'), maskedEmail, devCode: testRunCode(devCode) };
}

// POST /api/auth/verify-email  (public; carries the pending token from register/login)  { verifyToken, code }
async function verifyEmail(req, res, next) {
  try {
    let decoded;
    try {
      decoded = verifyPendingToken(req.body.verifyToken, 'verify_email');
    } catch {
      return next(new AppError('This verification link has expired. Please log in again.', 401));
    }

    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return next(new AppError('This verification link has expired. Please log in again.', 401));
    }
    if (user.emailVerified) {
      return next(new AppError('This email address is already verified.', 409));
    }

    await checkCode(user.id, 'verify_email', req.body.code);
    user.emailVerified = true;
    await user.save();

    // Verifying finishes the job registration started: unlike password reset, this earns a real login
    // immediately, since the person has now proven both their password AND their email in one sitting.
    // (If 2FA also happens to be on for this account, that check still runs on their next login.)
    const token = signToken(user);
    res.status(200).json({ success: true, message: 'Email verified.', data: { user: user.toJSON(), token } });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/verify-email/resend  (public; carries the pending token)  { verifyToken }
async function resendVerification(req, res, next) {
  try {
    let decoded;
    try {
      decoded = verifyPendingToken(req.body.verifyToken, 'verify_email');
    } catch {
      return next(new AppError('This verification link has expired. Please log in again.', 401));
    }
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return next(new AppError('This verification link has expired. Please log in again.', 401));
    }
    if (user.emailVerified) {
      return next(new AppError('This email address is already verified.', 409));
    }

    const last = await TwoFactorCode.findOne({ user: user.id, purpose: 'verify_email' }).sort({ createdAt: -1 });
    if (last) {
      const waitedMs = Date.now() - last.createdAt.getTime();
      if (waitedMs < RESEND_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((RESEND_COOLDOWN_MS - waitedMs) / 1000);
        res.set('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
          success: false,
          message: `Please wait ${retryAfterSeconds}s before requesting another code.`,
          retryAfterSeconds,
        });
      }
    }

    // Same choice as startVerification above: devCode is never forwarded for this flow, only logged
    // server-side by mailer.js when SMTP isn't configured.
    const { maskedEmail, devCode } = await issueCode(user, 'verify_email');
    res.status(200).json({ success: true, message: 'A new code has been sent.', data: { maskedEmail, devCode: testRunCode(devCode) } });
  } catch (err) {
    next(err);
  }
}

module.exports = { startVerification, verifyEmail, resendVerification };
