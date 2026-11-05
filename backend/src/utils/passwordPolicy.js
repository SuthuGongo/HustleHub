const crypto = require('crypto');
const { security } = require('../config/env');
const logger = require('./logger');

// The length / number / capital-letter rules stop weak guesses. They do not stop "Password1", which meets
// all three and is one of the first things an attacker tries. This adds two checks that do:
//   1. a built-in list of the most common passwords (works offline, always on), and
//   2. a lookup in the Pwned Passwords service for passwords that appear in known data breaches.

const COMMON = new Set([
  '123456', '12345678', '123456789', '1234567890', '12345', '1234567', '111111', '000000', '123123', '654321',
  'password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd', 'passw0rd1', 'p@ssw0rd', 'p@ssword', 'p@ssword1',
  'qwerty', 'qwerty1', 'qwerty12', 'qwerty123', 'qwertyuiop', 'qwerty1234', 'asdfghjkl', 'zxcvbnm', '1q2w3e4r', '1qaz2wsx',
  'abc123', 'abcd1234', 'abcdef1', 'abc12345', 'iloveyou', 'iloveyou1', 'welcome', 'welcome1', 'welcome123', 'letmein',
  'letmein1', 'admin', 'admin123', 'administrator', 'login', 'monkey', 'dragon', 'football', 'baseball', 'master',
  'sunshine', 'princess', 'superman', 'batman', 'trustno1', 'shadow', 'michael', 'jordan23', 'freedom', 'whatever',
  'hello123', 'secret', 'secret123', 'changeme', 'default', 'test1234', 'test123', 'testing123', 'guest', 'user123',
  'hustlehub', 'hustlehub1', 'hustlehub123', 'hustlehub+', 'summer2024', 'summer2025', 'winter2024', 'winter2025', 'spring2025', 'january1',
  'azerty', 'azerty123', 'pass1234', 'pass123', 'mypassword', 'mypassword1', 'newpassword1', 'newpassword', 'oldpassword', 'password!',
]);

function normalise(password) {
  return String(password).toLowerCase();
}

function isCommonPassword(password) {
  return COMMON.has(normalise(password));
}

// A password that is the person's own name or email name is guessable from information anyone can see.
function containsPersonalDetail(password, { email, name } = {}) {
  const pw = normalise(password);
  const parts = [];
  if (email) parts.push(String(email).split('@')[0]);
  if (name) parts.push(...String(name).split(/\s+/));
  return parts.map(normalise).filter((p) => p.length >= 4).some((p) => pw.includes(p));
}

// k-anonymity: only the first five characters of the password's SHA-1 hash leave this server. The service
// answers with every hash that starts the same way (hundreds of them) and the comparison happens here, so the
// service never learns which password, or even which hash, was being checked.
async function breachCount(password, fetchImpl = fetch) {
  const sha1 = crypto.createHash('sha1').update(String(password)).digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { 'Add-Padding': 'true', 'User-Agent': 'HustleHub-password-check' },
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`Pwned Passwords answered ${res.status}`);
  const text = await res.text();
  for (const line of text.split('\n')) {
    const [hashSuffix, count] = line.trim().split(':');
    if (hashSuffix === suffix) return Number(count) || 0;
  }
  return 0;
}

// Returns a message for the person when the password must be refused, or null when it is acceptable.
// The breach lookup fails OPEN: if the service is slow or down, signing up still works and the failure
// is logged, because an outage elsewhere must not stop people creating accounts.
async function checkPassword(password, details = {}, fetchImpl = fetch) {
  if (isCommonPassword(password)) {
    return 'That password is too common. Choose something harder to guess.';
  }
  if (containsPersonalDetail(password, details)) {
    return 'The password must not contain your name or email.';
  }
  if (security.breachCheck) {
    try {
      if ((await breachCount(password, fetchImpl)) > 0) {
        return 'That password has appeared in a known data breach. Choose a different one.';
      }
    } catch (err) {
      logger.warn('security.breach_check_unavailable', { error: err.message });
    }
  }
  return null;
}

module.exports = { isCommonPassword, containsPersonalDetail, breachCount, checkPassword };
