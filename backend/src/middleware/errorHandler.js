const logger = require('../utils/logger');

// Translate known low-level errors into safe, generic client responses.
// Nothing here ever returns stack traces, file paths, query details or config values.
function normalise(err) {
  if (err.type === 'entity.too.large') return { statusCode: 413, message: 'Request body is too large.' };
  if (err.type === 'entity.parse.failed') return { statusCode: 400, message: 'Request body contains malformed JSON.' };
  if (err.name === 'CastError') return { statusCode: 400, message: 'One of the supplied identifiers is invalid.' };
  if (err.name === 'ValidationError') return { statusCode: 422, message: 'The submitted data failed validation.' };
  if (err.code === 11000) return { statusCode: 409, message: 'A record with these details already exists.' };
  return null;
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const known = normalise(err);
  if (known) {
    // Full detail to the server log only (never to the response) - a CastError's path/value in
    // particular is exactly what you need to track down which field/record triggered it.
    logger.warn('error.handled', {
      errorName: err.name,
      message: err.message,
      field: err.path,
      value: err.value,
      status: known.statusCode,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      requestId: req.id,
    });
    return res.status(known.statusCode).json({ success: false, message: known.message });
  }

  const statusCode = err.isOperational ? err.statusCode : 500;
  const message = err.isOperational ? err.message : 'Something went wrong. Please try again later.';

  // Anything that is not one of our own deliberate AppErrors is a bug or an outage (database down, code
  // fault). The full detail, including the stack, goes to the log only and never to the response.
  if (!err.isOperational) {
    logger.error('error.unexpected', {
      error: err,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      userId: req.user && req.user.id,
      requestId: req.id,
    });
  }

  return res.status(statusCode).json({ success: false, message });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: 'The requested resource was not found.',
  });
}

module.exports = { errorHandler, notFoundHandler };
