const AppError = require('../utils/AppError');

// Role-based access control. Use AFTER authenticate:
//   router.post('/', authenticate, authorize('freelancer'), handler)
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401));
    }
    if (!allowedRoles.includes(req.user.role)) {
      // Line breaks are stripped from the URL so a crafted request cannot forge extra log lines.
      const safeUrl = req.originalUrl.replace(/\n|\r/g, '');
      console.warn(`[SECURITY] Forbidden: user=${req.user.id} role=${req.user.role} ${req.method} ${safeUrl}`);
      return next(new AppError('You do not have permission to perform this action.', 403));
    }
    return next();
  };
}

module.exports = authorize;
