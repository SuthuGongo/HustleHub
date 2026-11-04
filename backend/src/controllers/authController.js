const User = require('../models/User');
const { hashPassword, comparePassword, dummyCompare } = require('../utils/password');
const { signToken, signPendingToken } = require('../utils/token');
const AppError = require('../utils/AppError');
const { REGISTRABLE_ROLES } = require('../utils/constants');
const { startVerification } = require('./emailVerificationController');
const { issueCode } = require('../services/otpService');

async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body;

    // Defence in depth: the validator already restricts this, but a public endpoint must never mint admins.
    if (!REGISTRABLE_ROLES.includes(role)) {
      return next(new AppError('Role must be one of: freelancer, client.', 422));
    }

    const existingUser = await User.findOne({ email: { $eq: email } });
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

    const user = await User.findOne({ email: { $eq: email } }).select('+passwordHash');

    const genericAuthError = () => new AppError('Invalid email or password.', 401);

    if (!user) {
      await dummyCompare(password); // keep response time similar to a real check
      return next(genericAuthError());
    }

    const passwordMatches = await comparePassword(password, user.passwordHash);
    if (!passwordMatches) {
      return next(genericAuthError());
    }

    if (!user.isActive) {
      return next(new AppError('This account has been disabled. Please contact support.', 403));
    }

    if (!user.emailVerified) {
      // Correct password, but the account was never finished registering (or the first code expired
      // unused). Pick up exactly where register() left off, rather than a separate code path.
      const { verifyToken, maskedEmail, devCode } = await startVerification(user);
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
      return res.status(200).json({
        success: true,
        message: 'Enter the verification code sent to your email.',
        data: { requiresTwoFactor: true, twoFactorToken: signPendingToken(user, '2fa'), maskedEmail, devCode },
      });
    }

    const token = signToken(user);

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

module.exports = { register, login, getCurrentUser };
