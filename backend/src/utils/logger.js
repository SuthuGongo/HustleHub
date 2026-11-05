// Structured logging for HustleHub+.
//
// Every event is written as one line of JSON to the console (so Docker, Render and any log tool can read
// it), and, when a Better Stack source is configured, also sent to Better Stack over HTTPS in small
// batches. Each line has a time, a level, a short event name such as "auth.login.failed", and fields
// that say what happened. Three rules are enforced here so no caller can get them wrong:
//
//   1. Secrets never reach a log. Any field whose name looks sensitive (password, token, code, card,
//      authorization...) is replaced by "[REDACTED]", however deep it is nested.
//   2. A log line cannot be forged. Line breaks are removed from every string, and the whole entry is
//      JSON, so text typed by a user cannot pass for a separate log entry.
//   3. Logging can never break the app. Sending to Better Stack is fire-and-forget: if it is slow, down
//      or misconfigured, the batch is dropped and the app carries on.
const { log: logConfig, nodeEnv } = require('../config/env');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|otp|cvv|card|hash|apikey|^code$/i;
const MAX_STRING = 500;
const MAX_DEPTH = 4;
const MAX_QUEUE = 1000;

// "thandi.mokoena@gmail.com" -> "t***@gmail.com": enough to spot a repeated attacker or a typo, not
// enough to expose the address to anyone who can read the logs.
function maskEmail(email) {
  const [name = '', domain = ''] = String(email).split('@');
  return `${name.slice(0, 1)}***@${domain}`.replace(/\n|\r/g, '').slice(0, 100);
}

function clean(value, depth = 0) {
  if (typeof value === 'string') return value.replace(/\n|\r/g, '').slice(0, MAX_STRING);
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toHexString === 'function') return value.toHexString(); // a MongoDB id logs as its plain text
  if (value instanceof Error) {
    return { name: value.name, message: clean(value.message), stack: clean(String(value.stack || '').replace(/\n/g, ' | ')) };
  }
  if (depth >= MAX_DEPTH) return '[too deep]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => clean(v, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SENSITIVE_KEY.test(k) ? '[REDACTED]' : clean(v, depth + 1)])
    );
  }
  return String(value).replace(/\n|\r/g, '').slice(0, MAX_STRING);
}

// Sends entries to Better Stack: POST https://<ingesting host> with the source token as a Bearer token.
function createShipper({ token, host, fetchImpl = globalThis.fetch, intervalMs = 2000, maxBatch = 50, onError = () => {} }) {
  let queue = [];
  let timer = null;
  const url = `https://${String(host).replace(/^https?:\/\//, '')}`;

  async function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (queue.length === 0) return;
    const batch = queue;
    queue = [];
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(batch),
      });
      if (!res.ok) throw new Error(`Better Stack answered ${res.status}`);
    } catch (err) {
      onError(err); // the batch is dropped on purpose: logging must never slow or break the app
    }
  }

  function push(entry) {
    queue.push(entry);
    if (queue.length > MAX_QUEUE) queue.shift();
    if (queue.length >= maxBatch) {
      void flush();
    } else if (!timer) {
      timer = setTimeout(() => void flush(), intervalMs);
      timer.unref(); // a waiting log timer must never keep the process alive
    }
  }

  return { push, flush };
}

function createLogger({ level = 'info', service = 'hustlehub-api', env = 'development', write, shipper } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const out = write || ((line) => process.stdout.write(`${line}\n`));

  function emit(name, event, fields) {
    if (LEVELS[name] < threshold) return;
    const entry = { dt: new Date().toISOString(), level: name, message: event, event, service, env, ...clean(fields || {}) };
    out(JSON.stringify(entry));
    if (shipper) shipper.push(entry);
  }

  return {
    debug: (event, fields) => emit('debug', event, fields),
    info: (event, fields) => emit('info', event, fields),
    warn: (event, fields) => emit('warn', event, fields),
    error: (event, fields) => emit('error', event, fields),
    flush: () => (shipper ? shipper.flush() : Promise.resolve()),
  };
}

const shipper =
  logConfig.betterStackToken && logConfig.betterStackHost
    ? createShipper({
        token: logConfig.betterStackToken,
        host: logConfig.betterStackHost,
        onError: (err) => process.stderr.write(`${JSON.stringify({ level: 'warn', message: 'log.shipping.failed', error: err.message })}\n`),
      })
    : undefined;

const logger = createLogger({ level: logConfig.level, env: nodeEnv, shipper });

// Records crashes that would otherwise only be a line on stderr, and makes sure the last entries reach
// Better Stack before the process ends.
function installProcessHandlers(proc = process, log = logger) {
  proc.on('unhandledRejection', (reason) => {
    log.error('process.unhandled_rejection', { error: reason instanceof Error ? reason : new Error(String(reason)) });
  });
  proc.on('uncaughtException', (err) => {
    log.error('process.uncaught_exception', { error: err });
    void log.flush().finally(() => proc.exit(1));
  });
}

module.exports = logger;
module.exports.createLogger = createLogger;
module.exports.createShipper = createShipper;
module.exports.installProcessHandlers = installProcessHandlers;
module.exports.maskEmail = maskEmail;
module.exports.clean = clean;
