const { AppError } = require('../lib/errors');

function notFoundHandler(req, res, next) {
  const details = {
    method: req.method,
    path: req.originalUrl || req.url,
    query: req.query || {}
  };

  // eslint-disable-next-line no-console
  console.warn('[404_NOT_FOUND]', JSON.stringify(details));

  next(new AppError(404, 'NOT_FOUND', 'Route not found.', details));
}

module.exports = { notFoundHandler };
