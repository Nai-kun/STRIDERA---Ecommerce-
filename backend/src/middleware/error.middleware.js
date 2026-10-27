// Error handling middleware

/**
 * 404 Not Found handler
 */
function notFound(req, res, next) {
  const error = new Error(`Not Found — ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

/**
 * Global error handler
 */
function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Log error in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('Error:', {
      message,
      statusCode,
      stack: err.stack,
      path: req.originalUrl,
      method: req.method,
    });
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
}

/**
 * Create an operational error with status code
 */
function createError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
}

module.exports = { notFound, errorHandler, createError };
