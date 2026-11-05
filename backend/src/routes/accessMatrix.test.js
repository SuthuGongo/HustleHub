/* eslint-disable security/detect-non-literal-fs-filename -- this test only reads the repository's own route files */
// An access-control matrix for the whole API. Every route is listed here with who may use it, and the
// test then tries each one as an anonymous caller and as every role that is NOT allowed, expecting
// 401 and 403. A guard test fails if a route is added to a route file but not to this list, so a new
// endpoint can never go live without someone deciding (and recording) who may call it.
const fs = require('fs');
const http = require('http');
const path = require('path');

jest.mock('../models/User', () => ({
  findById: jest.fn((id) => ({
    select: async () => ({ id, role: ROLE_BY_ID[id], isActive: true }),
  })),
}));

const ROLE_BY_ID = {
  aaaaaaaaaaaaaaaaaaaaaaaa: 'client',
  bbbbbbbbbbbbbbbbbbbbbbbb: 'freelancer',
  cccccccccccccccccccccccc: 'admin',
};

const app = require('../app');
const { signToken, signPendingToken } = require('../utils/token');

const ALL = ['client', 'freelancer', 'admin'];
const ID = 'dddddddddddddddddddddddd';

// [method, mount + path, who may call it]  public | login (any signed-in role) | the allowed roles
const MATRIX = [
  ['post', '/api/auth/register', 'public'], ['post', '/api/auth/login', 'public'],
  ['post', '/api/auth/verify-email', 'public'], ['post', '/api/auth/verify-email/resend', 'public'],
  ['post', '/api/auth/forgot-password', 'public'], ['post', '/api/auth/reset-password', 'public'],
  ['post', '/api/auth/2fa/verify', 'public'], ['post', '/api/auth/2fa/resend', 'public'],
  ['get', '/api/auth/2fa/status', 'login'], ['post', '/api/auth/2fa/enable/request', 'login'],
  ['post', '/api/auth/2fa/enable/confirm', 'login'], ['post', '/api/auth/2fa/disable', 'login'],
  ['get', '/api/users/me', 'login'], ['get', '/api/users/me/sign-ins', 'login'],
  ['get', '/api/gigs', 'public'], ['get', '/api/gigs/categories', 'public'], ['get', '/api/gigs/mine', ['freelancer']],
  ['get', `/api/gigs/${ID}`, 'public'], ['get', `/api/gigs/${ID}/reviews`, 'public'],
  ['post', '/api/gigs', ['freelancer']], ['patch', `/api/gigs/${ID}`, ['freelancer']], ['delete', `/api/gigs/${ID}`, ['freelancer']],
  ['post', '/api/bookings', ['client']], ['get', '/api/bookings', ALL], ['get', `/api/bookings/${ID}`, ALL],
  ['patch', `/api/bookings/${ID}/complete`, ['freelancer']], ['post', `/api/bookings/${ID}/release`, ['client']],
  ['post', `/api/bookings/${ID}/dispute`, ['client']], ['post', `/api/bookings/${ID}/review`, ['client']],
  ['patch', `/api/bookings/${ID}/issue`, ['client', 'freelancer']],
  ['get', '/api/transactions', ALL], ['get', '/api/transactions/income', ['freelancer']],
  ['post', '/api/contact', 'public'], ['get', '/api/contact/mine', 'login'], ['patch', '/api/contact/mine/seen', 'login'],
  ['post', `/api/contact/mine/${ID}/reply`, 'login'],
  ['post', '/api/conversations', ['client']], ['get', '/api/conversations', 'login'],
  ['get', `/api/conversations/${ID}/messages`, 'login'], ['post', `/api/conversations/${ID}/messages`, 'login'],
  ['patch', `/api/conversations/${ID}/read`, 'login'],
  ...[
    ['get', '/stats'], ['get', '/report'], ['get', '/users'], ['patch', `/users/${ID}/status`], ['get', '/gigs'],
    ['delete', `/gigs/${ID}`], ['get', '/transactions'], ['get', '/escrow'], ['get', '/disputes'],
    ['post', `/disputes/${ID}/resolve`], ['get', '/audit'], ['get', '/audit/verify'], ['get', '/messages'],
    ['patch', `/messages/${ID}/status`], ['post', `/messages/${ID}/reply`],
  ].map(([m, p]) => [m, `/api/admin${p}`, ['admin']]),
];

let server;
let base;
const tokens = Object.fromEntries(Object.entries(ROLE_BY_ID).map(([id, role]) => [role, signToken({ id, role })]));

beforeAll(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

const call = async (method, url, token) => {
  const res = await fetch(base + url, {
    method: method.toUpperCase(),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(method === 'get' || method === 'delete' ? {} : { body: '{}' }),
  });
  return res.status;
};

test('every route in the route files is in the matrix, so none can be added without deciding who may call it', () => {
  const dir = path.join(__dirname);
  const declared = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('Routes.js'))
    .reduce((n, f) => n + (fs.readFileSync(path.join(dir, f), 'utf8').match(/router\.(get|post|patch|put|delete)\(/g) || []).length, 0);
  expect(MATRIX.length).toBe(declared);
});

const protectedRoutes = MATRIX.filter(([, , who]) => who !== 'public');

describe.each(protectedRoutes)('%s %s', (method, url, who) => {
  test('an anonymous caller is refused with 401', async () => {
    expect(await call(method, url)).toBe(401);
  });

  const denied = who === 'login' ? [] : ALL.filter((r) => !who.includes(r));
  if (denied.length) {
    test.each(denied.map((r) => [r]))('a %s is refused with 403', async (role) => {
      expect(await call(method, url, tokens[role])).toBe(403);
    });
  } else {
    test('every signed-in role is let in, so only the anonymous check applies', () => {
      expect(denied).toEqual([]);
    });
  }
});

describe('credentials that must never work', () => {
  const sample = '/api/users/me';

  test('a garbage token, a token signed with another key and a malformed header are all 401', async () => {
    expect(await call('get', sample, 'not.a.token')).toBe(401);
    const jwt = require('jsonwebtoken');
    expect(await call('get', sample, jwt.sign({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', role: 'admin' }, 'some-other-secret'))).toBe(401);
    const res = await fetch(base + sample, { headers: { Authorization: 'Token abc' } });
    expect(res.status).toBe(401);
  });

  test('an unsigned token ("alg: none") is refused', async () => {
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ id: 'cccccccccccccccccccccccc', role: 'admin' })}.`;
    expect(await call('get', '/api/admin/stats', unsigned)).toBe(401);
  });

  test('a half-finished login (two-factor or email-verification token) never counts as a session', async () => {
    for (const stage of ['2fa', 'verify_email']) {
      expect(await call('get', '/api/admin/stats', signPendingToken({ id: 'cccccccccccccccccccccccc' }, stage))).toBe(401);
      expect(await call('get', sample, signPendingToken({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa' }, stage))).toBe(401);
    }
  });

  test('a role written into the token is ignored: the database decides', async () => {
    const forged = signToken({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', role: 'admin' }); // a client's id, claiming admin
    expect(await call('get', '/api/admin/stats', forged)).toBe(403);
  });
});
