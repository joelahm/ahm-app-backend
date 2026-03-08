const { AppError } = require('../lib/errors');

function requireRole(...allowedRoles) {
  return function roleMiddleware(req, res, next) {
    if (!req.auth) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
    }

    if (!allowedRoles.includes(req.auth.role)) {
      return next(new AppError(403, 'FORBIDDEN', 'Insufficient permissions.'));
    }

    return next();
  };
}

module.exports = { requireRole };
