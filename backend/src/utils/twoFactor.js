const crypto = require('crypto');
const { jwtSecret } = require('../config/env');

const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 5; // a code is burned after this many wrong guesses, even before it expires
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 45 * 1000; // how long the frontend must wait before offering "Resend"
const BACKUP_CODE_COUNT = 8;

// Generates a random 6-digit code as a zero-padded string ("004821"), never starting from a
// predictable source: crypto.randomInt is CSPRNG-backed, unlike Math.random.
function generateCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(CODE_LENGTH, '0');
}

// One-time codes are short-lived and rate-limited (unlike passwords), so a fast, keyed hash is
// appropriate here instead of bcrypt: HMAC-SHA256 with the app's own secret as the key, so a
// leaked database alone (without JWT_SECRET too) still can't be brute-forced offline.
function hashCode(code) {
  return crypto.createHmac('sha256', jwtSecret).update(code).digest('hex');
}

function codeMatches(code, hash) {
  const candidate = Buffer.from(hashCode(code));
  const stored = Buffer.from(hash);
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

function generateBackupCodes(count = BACKUP_CODE_COUNT) {
  // Format: XXXX-XXXX, easy to read back and type once, from a wide alphabet minus look-alike characters.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const one = () =>
    Array.from({ length: 8 }, () => alphabet[crypto.randomInt(0, alphabet.length)]).join('');
  return Array.from({ length: count }, () => {
    const raw = one();
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}

function hashBackupCode(code) {
  return hashCode(code.toUpperCase());
}

module.exports = {
  CODE_LENGTH,
  MAX_ATTEMPTS,
  CODE_TTL_MS,
  RESEND_COOLDOWN_MS,
  generateCode,
  hashCode,
  codeMatches,
  generateBackupCodes,
  hashBackupCode,
};
