// NoSQL-injection / prototype-pollution guard.
// Removes any key that starts with "$" (Mongo operators such as $gt, $ne, $where),
// contains "." (path traversal into documents) or is a prototype-pollution vector.
// Applied to the JSON body and route params before any validator or controller sees them.
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isForbiddenKey(key) {
  return key.startsWith('$') || key.includes('.') || FORBIDDEN_KEYS.has(key);
}

function clean(value) {
  if (Array.isArray(value)) {
    value.forEach(clean);
    return value;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (isForbiddenKey(key)) {
        delete value[key];
      } else {
        clean(value[key]);
      }
    }
  }
  return value;
}

function sanitizeInput(req, res, next) {
  if (req.body && typeof req.body === 'object') clean(req.body);
  if (req.params && typeof req.params === 'object') clean(req.params);
  next();
}

module.exports = sanitizeInput;
module.exports.clean = clean;
