const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

// Role-based access control. Use AFTER authenticate:
//   router.post('/', authenticate, authorize('freelancer'), handler)
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401));
    }
    if (!allowedRoles.includes(req.user.role)) {
      // The logger removes line breaks from every value, so a crafted URL cannot forge extra log lines.
      logger.warn('security.access_denied', { userId: req.user.id, role: req.user.role, method: req.method, path: req.originalUrl.split('?')[0], requestId: req.id });
      return next(new AppError('You do not have permission to perform this action.', 403));
    }
    return next();
  };
}

module.exports = authorize;
