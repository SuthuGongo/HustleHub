const crypto = require('node:crypto');
const logger = require('../utils/logger');

// Logs one line per request when it finishes: who asked for what, what the answer was and how long it
// took. It also gives every request an id, returned in the X-Request-Id header and repeated in the
// error log lines for that request, so one failing request can be followed from the browser to the log.
// Query strings are left out (they can carry search text or codes), and so are request bodies.
function requestLogger(req, res, next) {
  const started = process.hrtime.bigint();
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);

  res.on('finish', () => {
    const status = res.statusCode;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    const isHealthCheck = req.originalUrl === '/api/health';
    logger[isHealthCheck ? 'debug' : level]('http.request', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status,
      durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
      ip: req.ip,
      userId: req.user && req.user.id,
      role: req.user && req.user.role,
    });
  });

  next();
}

module.exports = requestLogger;
