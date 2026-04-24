class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function toErrorResponse(err) {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      body: {
        error: {
          code: err.code,
          message: err.message,
          details: err.details || null
        }
      }
    };
  }

  if (err?.type === 'entity.too.large') {
    return {
      statusCode: 413,
      body: {
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request payload is too large.',
          details: {
            limit: err.limit ?? null,
            length: err.length ?? null
          }
        }
      }
    };
  }

  return {
    statusCode: 500,
    body: {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
        details: null
      }
    }
  };
}

module.exports = { AppError, toErrorResponse };
