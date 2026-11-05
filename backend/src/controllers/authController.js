const User = require('../models/User');
const { hashPassword, comparePassword, dummyCompare } = require('../utils/password');
const { signToken, signPendingToken } = require('../utils/token');
const AppError = require('../utils/AppError');
const { REGISTRABLE_ROLES } = require('../utils/constants');
const { startVerification } = require('./emailVerificationController');
const { issueCode } = require('../services/otpService');
const logger = require('../utils/logger');
const { maskEmail } = logger;
const { security } = require('../config/env');
const { recordSignIn, listRecentSignIns } = require('../utils/signInHistory');
const { isLocked, minutesLeft, registerFailure, clearFailures } = require('../utils/accountLockout');

async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body;

    // Defence in depth: the validator already restricts this, but a public endpoint must never mint admins.
    if (!REGISTRABLE_ROLES.includes(role)) {
      return next(new AppError('Role must be one of: freelancer, client.', 422));
    }

    const existingUser = await User.findOne({ email: { $eq: String(email) } });
    if (existingUser) {
      return next(new AppError('An account with this email already exists.', 409));
    }

    const passwordHash = await hashPassword(password);
    const newUser = await User.create({ name, email, passwordHash, role });

    // The account exists but is not usable yet: registering is step one of a two-step process, the
    // same shape login() falls into below for an already-registered but still-unverified account.
    // devCode is deliberately not forwarded here (see forgotPassword's own note on this): without real
    // SMTP configured the code still reaches the person, just via the server's own console log (see
    // mailer.js), the same way a forgotten-password code does - never surfaced to the browser itself.
    const { verifyToken, maskedEmail, devCode } = await startVerification(newUser);
    logger.info('auth.register.success', { userId: newUser.id, role: newUser.role, ip: req.ip, requestId: req.id });

    res.status(201).json({
      success: true,
      message: 'Account created. Enter the verification code sent to your email to finish signing up.',
      data: { requiresVerification: true, verifyToken, maskedEmail, devCode },
    });
  } catch (err) {
    next(err); // a duplicate-key race is translated to 409 by the error handler
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: { $eq: String(email) } }).select('+passwordHash +lockUntil');

    const genericAuthError = () => new AppError('Invalid email or password.', 401);

    // One place for every failed attempt: what is logged is the reason, a masked address and the caller's IP,
    // never the password. The person who is trying sees the same generic message whatever the reason.
    const failed = (reason, userId) =>
      logger.warn('auth.login.failed', { reason, userId, email: maskEmail(email), ip: req.ip, requestId: req.id });

    if (!user) {
      await dummyCompare(password); // keep response time similar to a real check
      failed('unknown_email');
      return next(genericAuthError());
    }

    // A locked account refuses every attempt, including the right password, until the lock runs out.
    if (isLocked(user)) {
      failed('account_locked', user.id);
      return next(new AppError(`Too many failed sign-in attempts. Try again in ${minutesLeft(user)} minute(s), or reset your password.`, 423));
    }

    const passwordMatches = await comparePassword(password, user.passwordHash);
    if (!passwordMatches) {
      failed('wrong_password', user.id);
      const nowLocked = await registerFailure(user, { ip: req.ip, requestId: req.id });
      if (nowLocked) {
        return next(new AppError(`Too many failed sign-in attempts. This account is locked for ${security.lockoutMinutes} minutes.`, 423));
      }
      return next(genericAuthError());
    }
    await clearFailures(user);

    if (!user.isActive) {
      failed('account_disabled', user.id);
      return next(new AppError('This account has been disabled. Please contact support.', 403));
    }

    if (!user.emailVerified) {
      // Correct password, but the account was never finished registering (or the first code expired
      // unused). Pick up exactly where register() left off, rather than a separate code path.
      const { verifyToken, maskedEmail, devCode } = await startVerification(user);
      logger.info('auth.login.email_verification_required', { userId: user.id, ip: req.ip, requestId: req.id });
      return res.status(200).json({
        success: true,
        message: 'Enter the verification code sent to your email to finish signing up.',
        data: { requiresVerification: true, verifyToken, maskedEmail, devCode },
      });
    }

    if (user.twoFactorEnabled) {
      // The password was correct, but that alone is not enough: issue a short-lived, narrowly-scoped
      // token and email a one-time code instead of a real session. No user data goes out yet.
      const { maskedEmail, devCode } = await issueCode(user, 'login');
      logger.info('auth.login.two_factor_required', { userId: user.id, ip: req.ip, requestId: req.id });
      return res.status(200).json({
        success: true,
        message: 'Enter the verification code sent to your email.',
        data: { requiresTwoFactor: true, twoFactorToken: signPendingToken(user, '2fa'), maskedEmail, devCode },
      });
    }

    const token = signToken(user);
    await recordSignIn(user, req, 'password');
    logger.info('auth.login.success', { userId: user.id, role: user.role, method: 'password', ip: req.ip, requestId: req.id });

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: { user: user.toJSON(), token },
    });
  } catch (err) {
    next(err);
  }
}

async function getCurrentUser(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return next(new AppError('User not found.', 404));
    }
    res.status(200).json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
}

// GET /api/users/me/sign-ins - the caller's own recent sign-ins (never anyone else's: the id comes from the token).
async function getMySignIns(req, res, next) {
  try {
    res.status(200).json({ success: true, data: { signIns: await listRecentSignIns(req.user.id) } });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, getCurrentUser, getMySignIns };
