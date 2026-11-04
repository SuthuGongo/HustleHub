const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { rateLimit: limits } = require('../config/env');

const windowMs = limits.windowMinutes * 60 * 1000;

function humanWait(seconds) {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

// Builds a limiter that answers 429 with a clear, machine- and human-readable body.
function buildLimiter({ limit, what, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-6', // RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset
    legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: (req, res) => {
      const resetTime = req.rateLimit && req.rateLimit.resetTime;
      const retryAfterSeconds = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(windowMs / 1000);
      res.set('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        success: false,
        message: `Too many ${what}. Limit is ${limit} per ${limits.windowMinutes} minutes. Please try again in ${humanWait(retryAfterSeconds)}.`,
        retryAfterSeconds,
      });
    },
  });
}

// Login + registration: brute-force and account-spam protection, per IP address.
const authLimiter = buildLimiter({ limit: limits.authMax, what: 'authentication attempts' });

// Booking: limits per logged-in user (falls back to IP), so one abusive account
// cannot spam bookings/transactions but other users on the same network are unaffected.
const bookingLimiter = buildLimiter({
  limit: limits.bookingMax,
  what: 'booking requests',
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip)),
});

// One-time email codes: guards every code-verification or code-resend endpoint against brute force,
// per IP address - 2FA login, turning 2FA on, verifying a new account's email, and password reset all
// share this. It sits on top of the per-code attempt limit and resend cooldown enforced in
// otpService.js/twoFactorController.js themselves, not instead of them.
const otpLimiter = buildLimiter({ limit: limits.otpMax, what: 'verification attempts' });

// Contact form: stops one visitor flooding the team's inbox. Per IP address, because visitors may be anonymous.
const contactLimiter = buildLimiter({ limit: limits.contactMax, what: 'contact messages' });

// Chat: limits per logged-in user, so one person flooding a conversation cannot make it unusable and
// cannot be used to spam a stranger via "message the seller" repeatedly. Applies to the REST endpoints;
// the socket path (sockets/chatSocket.js) enforces the same limit natively, since Express middleware
// never runs for a socket event - see utils/socketRateLimiter.js.
const chatLimiter = buildLimiter({
  limit: limits.chatMax,
  what: 'chat messages',
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip)),
});

// Broad safety net for every other /api route, per IP address.
const apiLimiter = buildLimiter({ limit: limits.apiMax, what: 'requests' });

module.exports = { authLimiter, bookingLimiter, contactLimiter, apiLimiter, otpLimiter, chatLimiter };
