const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

async function hashPassword(plainTextPassword) {
  return bcrypt.hash(plainTextPassword, SALT_ROUNDS);
}

async function comparePassword(plainTextPassword, hash) {
  return bcrypt.compare(plainTextPassword, hash);
}

// Login for an unknown email would otherwise return noticeably faster than a
// wrong password (no bcrypt work), letting an attacker discover which emails
// are registered. Comparing against a throw-away hash evens the timing out.
let dummyHashPromise;
async function dummyCompare(plainTextPassword) {
  if (!dummyHashPromise) dummyHashPromise = bcrypt.hash('timing-equaliser', SALT_ROUNDS);
  return bcrypt.compare(String(plainTextPassword), await dummyHashPromise);
}

module.exports = { hashPassword, comparePassword, dummyCompare };
