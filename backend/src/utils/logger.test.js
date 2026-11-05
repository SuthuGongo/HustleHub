const { createLogger, createShipper, installProcessHandlers, maskEmail, clean } = require('./logger');
const requestLogger = require('../middleware/requestLogger');
const { EventEmitter } = require('node:events');

const capture = (options = {}) => {
  const lines = [];
  const log = createLogger({ write: (line) => lines.push(JSON.parse(line)), ...options });
  return { log, lines };
};

describe('logger output', () => {
  test('writes one JSON entry with time, level, event, service and the fields', () => {
    const { log, lines } = capture({ service: 'test-api', env: 'test' });
    log.info('booking.created', { bookingId: 'b1', amount: 500 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 'info', event: 'booking.created', message: 'booking.created', service: 'test-api', env: 'test', bookingId: 'b1', amount: 500 });
    expect(new Date(lines[0].dt).toString()).not.toBe('Invalid Date');
  });

  test('skips entries below the configured level', () => {
    const { log, lines } = capture({ level: 'warn' });
    log.debug('a');
    log.info('b');
    log.warn('c');
    log.error('d');
    expect(lines.map((l) => l.event)).toEqual(['c', 'd']);
  });

  test('silent writes nothing', () => {
    const { log, lines } = capture({ level: 'silent' });
    log.error('x');
    expect(lines).toHaveLength(0);
  });
});

describe('what never reaches a log', () => {
  test('passwords, tokens, codes, cards and authorization headers are redacted, however deep', () => {
    const { log, lines } = capture();
    log.info('x', {
      password: 'hunter2',
      user: { email: 'a@b.com', token: 'jwt-value', nested: { cardNumber: '4111111111111111', code: '123456' } },
      headers: { Authorization: 'Bearer abc', 'x-fine': 'ok' },
      newPasswordConfirm: 'secret-text',
    });
    const text = JSON.stringify(lines[0]);
    for (const secret of ['hunter2', 'jwt-value', '4111111111111111', '123456', 'Bearer abc', 'secret-text']) {
      expect(text).not.toContain(secret);
    }
    expect(lines[0].password).toBe('[REDACTED]');
    expect(lines[0].user.nested.code).toBe('[REDACTED]');
    expect(lines[0].headers['x-fine']).toBe('ok');
  });

  test('line breaks are removed, so text typed by a user cannot forge a second log entry', () => {
    const { log, lines } = capture();
    log.warn('x', { path: '/api/x\n{"level":"error","event":"fake"}\r\nmore' });
    expect(lines).toHaveLength(1);
    expect(lines[0].path).not.toMatch(/[\r\n]/);
    expect(lines[0].event).toBe('x');
  });

  test('long strings are cut and deep objects are limited', () => {
    expect(clean('a'.repeat(2000))).toHaveLength(500);
    expect(clean({ a: { b: { c: { d: { e: 1 } } } } }).a.b.c.d).toBe('[too deep]');
    expect(clean(Array.from({ length: 50 }, (_, i) => i))).toHaveLength(20);
  });

  test('errors keep their name, message and stack on one line', () => {
    const out = clean(new Error('boom'));
    expect(out).toMatchObject({ name: 'Error', message: 'boom' });
    expect(out.stack).not.toMatch(/\n/);
  });

  test('dates, null and odd types are handled', () => {
    expect(clean(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01T00:00:00.000Z');
    expect(clean(null)).toBeNull();
    expect(clean(Symbol('s'))).toBe('Symbol(s)');
  });

  test('a MongoDB id is logged as plain text, not as its internal parts', () => {
    const id = new (require('mongoose').Types.ObjectId)('6aebcd07f94c90edb5d5f1ae');
    expect(clean({ bookingId: id }).bookingId).toBe('6aebcd07f94c90edb5d5f1ae');
  });

  test('maskEmail keeps the first letter and the domain only', () => {
    expect(maskEmail('thandi.mokoena@gmail.com')).toBe('t***@gmail.com');
    expect(maskEmail('x\n@evil.com')).not.toMatch(/\n/);
  });
});

describe('Better Stack shipping', () => {
  const okFetch = () => jest.fn().mockResolvedValue({ ok: true, status: 202 });

  test('sends a batch with the bearer token to the ingesting host', async () => {
    const fetchImpl = okFetch();
    const shipper = createShipper({ token: 'tok123', host: 'https://s1.example.betterstackdata.com', fetchImpl });
    shipper.push({ event: 'a' });
    shipper.push({ event: 'b' });
    await shipper.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://s1.example.betterstackdata.com');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok123');
    expect(JSON.parse(init.body).map((e) => e.event)).toEqual(['a', 'b']);
  });

  test('sends by itself once a batch is full, and after a short delay otherwise', async () => {
    jest.useFakeTimers();
    const fetchImpl = okFetch();
    const shipper = createShipper({ token: 't', host: 'h', fetchImpl, maxBatch: 2, intervalMs: 1000 });
    shipper.push({ event: 'a' });
    expect(fetchImpl).not.toHaveBeenCalled();
    shipper.push({ event: 'b' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    shipper.push({ event: 'c' });
    await jest.advanceTimersByTimeAsync(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  test('does nothing when there is nothing to send', async () => {
    const fetchImpl = okFetch();
    await createShipper({ token: 't', host: 'h', fetchImpl }).flush();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('a network failure or a rejection is reported and never thrown', async () => {
    const onError = jest.fn();
    const down = createShipper({ token: 't', host: 'h', fetchImpl: jest.fn().mockRejectedValue(new Error('offline')), onError });
    down.push({ event: 'a' });
    await expect(down.flush()).resolves.toBeUndefined();
    const refused = createShipper({ token: 't', host: 'h', fetchImpl: jest.fn().mockResolvedValue({ ok: false, status: 401 }), onError });
    refused.push({ event: 'a' });
    await refused.flush();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls[1][0].message).toMatch(/401/);
  });

  test('a logger with a shipper sends every entry it prints', async () => {
    const fetchImpl = okFetch();
    const shipper = createShipper({ token: 't', host: 'h', fetchImpl });
    const { log } = capture({ shipper });
    log.info('auth.login.success', { userId: 'u1' });
    await log.flush();
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)[0]).toMatchObject({ event: 'auth.login.success', userId: 'u1' });
  });

  test('flush on a logger with no shipper resolves', async () => {
    await expect(capture().log.flush()).resolves.toBeUndefined();
  });
});

describe('process handlers', () => {
  test('log a rejection and a crash, then exit with code 1 after flushing', async () => {
    const proc = new EventEmitter();
    proc.exit = jest.fn();
    const log = { error: jest.fn(), flush: jest.fn().mockResolvedValue() };
    installProcessHandlers(proc, log);
    proc.emit('unhandledRejection', new Error('lost promise'));
    proc.emit('unhandledRejection', 'plain text reason');
    proc.emit('uncaughtException', new Error('crash'));
    await Promise.resolve();
    await Promise.resolve();
    expect(log.error).toHaveBeenCalledWith('process.unhandled_rejection', expect.any(Object));
    expect(log.error).toHaveBeenCalledWith('process.uncaught_exception', expect.any(Object));
    expect(proc.exit).toHaveBeenCalledWith(1);
  });
});

describe('request logger', () => {
  const makeRes = (status) => {
    const res = new EventEmitter();
    res.statusCode = status;
    res.headers = {};
    res.setHeader = (k, v) => { res.headers[k] = v; };
    return res;
  };

  test('gives the request an id and logs method, path without the query, status and the user', () => {
    const logger = require('./logger');
    const info = jest.spyOn(logger, 'info').mockImplementation(() => {});
    const req = { method: 'GET', originalUrl: '/api/gigs?q=secret-search', ip: '10.0.0.1', user: { id: 'u1', role: 'client' } };
    const res = makeRes(200);
    const next = jest.fn();
    requestLogger(req, res, next);
    res.emit('finish');
    expect(next).toHaveBeenCalled();
    expect(res.headers['X-Request-Id']).toBe(req.id);
    const [event, fields] = info.mock.calls[0];
    expect(event).toBe('http.request');
    expect(fields).toMatchObject({ method: 'GET', path: '/api/gigs', status: 200, userId: 'u1', role: 'client', requestId: req.id });
    expect(JSON.stringify(fields)).not.toContain('secret-search');
    info.mockRestore();
  });

  test('uses warn for 4xx and error for 5xx, and debug for the health check', () => {
    const logger = require('./logger');
    const spies = { warn: jest.spyOn(logger, 'warn'), error: jest.spyOn(logger, 'error'), debug: jest.spyOn(logger, 'debug') };
    Object.values(spies).forEach((s) => s.mockImplementation(() => {}));
    const fire = (status, url) => {
      const res = makeRes(status);
      requestLogger({ method: 'GET', originalUrl: url, ip: '1.1.1.1' }, res, () => {});
      res.emit('finish');
    };
    fire(404, '/api/nope');
    fire(500, '/api/boom');
    fire(200, '/api/health');
    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.error).toHaveBeenCalledTimes(1);
    expect(spies.debug).toHaveBeenCalledTimes(1);
    Object.values(spies).forEach((s) => s.mockRestore());
  });
});
