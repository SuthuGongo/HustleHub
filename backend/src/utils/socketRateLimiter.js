const { rateLimit: limits } = require('../config/env');

const windowMs = limits.windowMinutes * 60 * 1000;

// A minimal sliding-window limiter for events that never pass through Express (socket messages), so
// the same RATE_LIMIT_CHAT_MAX applies whichever transport was used to send. In-memory, like the app's
// other limiters (see rateLimiter.js's own comment on that trade-off for a multi-instance deployment).
const hits = new Map(); // userId -> array of timestamps within the current window

function isRateLimited(userId) {
  const now = Date.now();
  const recent = (hits.get(userId) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > limits.chatMax;
}

module.exports = { isRateLimited };
