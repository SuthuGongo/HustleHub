const jwt = require('jsonwebtoken');
const { jwtSecret, jwtExpiresIn, twoFactorTokenExpiresIn } = require('../config/env');

// Pin the algorithm on both sign and verify so a token can never be accepted
// with "alg: none" or an unexpected algorithm.
const ALGORITHM = 'HS256';

function signToken(user) {
  // Keep the payload minimal: no email, name or anything sensitive (JWTs are readable by anyone).
  const payload = { id: user.id, role: user.role };
  return jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn, algorithm: ALGORITHM });
}

function verifyToken(token) {
  return jwt.verify(token, jwtSecret, { algorithms: [ALGORITHM] });
}

// A separate, short-lived token issued for an in-progress security step that is NOT yet a real login:
// after a correct password but before a correct 2FA code, after registering but before the email is
// verified, or while resetting a forgotten password. Each carries a "stage" claim naming exactly which
// step it is for, so a token minted for one flow can never be replayed against a different one, and
// none of them can be mistaken for (or accepted as) a real session token - authenticate.js only ever
// accepts tokens with no "stage" claim at all, so a pending token of any stage grants no API access.
const PENDING_STAGES = ['2fa', 'verify_email'];

function signPendingToken(user, stage) {
  if (!PENDING_STAGES.includes(stage)) throw new Error(`Unknown pending token stage: ${stage}`);
  const payload = { id: user.id, stage };
  return jwt.sign(payload, jwtSecret, { expiresIn: twoFactorTokenExpiresIn, algorithm: ALGORITHM });
}

// Verifies a pending token and rejects anything that isn't one for exactly the expected stage,
// including a normal access token or a pending token issued for a different stage.
function verifyPendingToken(token, expectedStage) {
  const decoded = jwt.verify(token, jwtSecret, { algorithms: [ALGORITHM] });
  if (decoded.stage !== expectedStage) {
    throw new Error('Token is not valid for this step.');
  }
  return decoded;
}

module.exports = { signToken, verifyToken, signPendingToken, verifyPendingToken };
