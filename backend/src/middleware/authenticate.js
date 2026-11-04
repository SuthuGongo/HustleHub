const { verifyToken } = require('../utils/token');
const AppError = require('../utils/AppError');
const User = require('../models/User');

// Verifies the Bearer token and loads the account. Throws AppError(401) for anything wrong with the credentials.
async function resolveUser(req) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new AppError('Authentication required.', 401);
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    throw new AppError('Invalid or expired token.', 401);
  }

  // A pending token (2FA verification, email verification - issued mid-flow, before the person is
  // fully logged in) must NEVER work as a real session token. It only carries an id, no role, so
  // without this check it would still authenticate successfully below, since role is looked up from
  // the database by id alone. Only tokens with no "stage" claim at all are treated as real sessions.
  if (decoded.stage) {
    throw new AppError('Invalid or expired token.', 401);
  }

  // Trust the database, not the token, for role and status: a demoted or
  // disabled account loses access immediately instead of when the token expires.
  const user = await User.findById(decoded.id).select('role isActive');
  if (!user || !user.isActive) {
    throw new AppError('Authentication required.', 401);
  }
  return { id: user.id, role: user.role };
}

// Required login: no valid token => 401.
async function authenticate(req, res, next) {
  try {
    req.user = await resolveUser(req);
    return next();
  } catch (err) {
    return next(err); // AppError => 401; anything else (database down) => 500, not a misleading 401
  }
}

// Public routes that behave a little differently for signed-in people (e.g. an owner can still see their
// own paused gig). Missing, expired or invalid credentials simply mean "anonymous" here; they never widen access.
async function optionalAuthenticate(req, res, next) {
  if (!req.headers.authorization) return next();
  try {
    req.user = await resolveUser(req);
    return next();
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 401) return next();
    return next(err);
  }
}

module.exports = authenticate;
module.exports.optionalAuthenticate = optionalAuthenticate;
