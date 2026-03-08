const { toErrorResponse } = require('../lib/errors');

function errorHandler(err, req, res, next) {
  const { statusCode, body } = toErrorResponse(err);
  if (statusCode >= 500) {
    // Keep server-side trace; sanitize client payload.
    // eslint-disable-next-line no-console
    console.error(err);
  }
  res.status(statusCode).json(body);
}

module.exports = { errorHandler };
