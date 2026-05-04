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

  // Body-parser surfaces malformed JSON bodies as a SyntaxError with
  // `type === 'entity.parse.failed'`. Treat as a client error, not a 5xx.
  if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Malformed JSON body.',
          details: null
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
