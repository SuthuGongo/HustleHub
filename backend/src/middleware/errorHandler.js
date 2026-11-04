const { isProduction } = require('../config/env');

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
    if (!isProduction) {
      console.warn('[HANDLED ERROR]', err.name, '-', err.message, {
        path: err.path,
        value: err.value,
        reason: err.reason?.message,
      });
    }
    return res.status(known.statusCode).json({ success: false, message: known.message });
  }

  const statusCode = err.isOperational ? err.statusCode : 500;
  const message = err.isOperational ? err.message : 'Something went wrong. Please try again later.';

  if (!err.isOperational) {
    console.error('[UNEXPECTED ERROR]', err); // full detail stays in the server log only
  } else if (!isProduction) {
    console.warn('[HANDLED ERROR]', err.message);
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
