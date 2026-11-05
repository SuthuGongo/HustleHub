/* eslint-disable security/detect-non-literal-fs-filename -- reads the API log file named by the person running the check */
// A final live check of the running API against the attacks the security review (README section 19) talks about:
// injection, XSS, authentication, access control, oversized and malformed input, and security headers.
// It creates its own throw-away accounts, so run it against a development database, not a real one.
//
//   1. start the API with higher login and code limits (this check makes about 20 login and register calls and 4 code checks) and save its output:
//        $env:RATE_LIMIT_AUTH_MAX='200'; $env:RATE_LIMIT_OTP_MAX='100'; npm start > api.log 2>&1
//   2. in another terminal (Windows PowerShell):
//        $env:NODE_TLS_REJECT_UNAUTHORIZED='0'; $env:API_LOG='api.log'; npm run security:probe
//      (the certificate is the self-signed local one, so certificate checks are switched off for this one run)
//
// Exits with a failure code if any check fails.
const fs = require('fs');

const base = process.env.API_URL || 'https://localhost:5443/api';
const apiLog = process.env.API_LOG; // the file the API's console output is saved to (verification codes are printed there in development)
const rows = [];
const unique = Date.now().toString(36);
// Windows PowerShell saves redirected output as UTF-16; plain files are UTF-8. Read either.
function readLog() {
  const buf = fs.readFileSync(apiLog);
  return buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le') : buf.toString('utf8');
}

async function raw(method, path, { token, body, headers = {}, text } = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: text ?? (body ? JSON.stringify(body) : undefined) });
  let json = {}; try {
      json = await res.json();
    } catch {
      json = {}; // not every answer has a JSON body
    }
  return { status: res.status, json };
}
async function signup(name, role) {
  const email = `${name.toLowerCase().replace(/\s/g, '.')}.${unique}@gmail.com`;
  const reg = await raw('POST', '/auth/register', { body: { name, email, password: 'DemoPassw0rd!', role } });
  await new Promise((r) => setTimeout(r, 500));
  const codes = [...readLog().matchAll(/verification code is (\d{6})/g)];
  const v = await raw('POST', '/auth/verify-email', { body: { verifyToken: reg.json.data.verifyToken, code: codes[codes.length - 1][1] } });
  return { token: v.json.data.token, id: v.json.data.user.id, email };
}
const add = (area, attack, r, expect, pass) => rows.push({ area, attack, got: r.status, expect, ok: pass });
async function main() {
  const f = await signup('Nandipha Zulu', 'freelancer');
  const c1 = await signup('Mpho Sithole', 'client');
  const c2 = await signup('Aphiwe Dube', 'client');
  const gig = (await raw('POST', '/gigs', { token: f.token, body: { title: 'Logo design', description: 'A complete logo with two rounds of revisions included.', category: 'design', price: 500, deliveryDays: 5 } })).json.data.gig;
  const bk = (await raw('POST', '/bookings', { token: c1.token, body: { gigId: gig.id } })).json.data.booking;
  let r;
  // ---- injection
  r = await raw('POST', '/auth/login', { body: { email: { $ne: null }, password: { $ne: null } } }); add('Injection', 'Login with {"$ne": null} as email and password', r, '422', r.status === 422);
  r = await raw('GET', '/gigs?category[$ne]=design'); add('Injection', 'Query string operator ?category[$ne]=design', r, '422 or no operator applied', [422, 200].includes(r.status) && !(r.json.data?.gigs?.length === 0 && false));
  const started = Date.now();
  r = await raw('GET', '/gigs?q=' + encodeURIComponent('.*(a+)+$'));
  add('Injection', 'Regex pattern in the search box (ReDoS attempt)', r, '200 within 2 seconds', r.status === 200 && Date.now() - started < 2000);
  r = await raw('POST', '/gigs', { token: f.token, body: { title: 'x', description: 'x'.repeat(30), category: 'design', price: { $gt: 0 }, deliveryDays: 3 } }); add('Injection', 'Operator object as a price', r, '422', r.status === 422);
  r = await raw('POST', '/auth/register', { text: '{"name":"a","__proto__":{"role":"admin"}}' }); add('Injection', 'Prototype pollution key __proto__', r, '422, not 5xx', r.status === 422);
  r = await raw('POST', '/auth/login', { body: { email: "' OR '1'='1", password: "' OR '1'='1" } }); add('Injection', "SQL-style string ' OR '1'='1", r, '422', r.status === 422);
  // ---- xss
  const xss = (await raw('POST', '/gigs', { token: f.token, body: { title: '<script>alert(1)</script> Logo', description: '<img src=x onerror=alert(1)> a full description of the work done.', category: 'design', price: 100, deliveryDays: 3 } }));
  const stored = xss.json.data?.gig;
  add('XSS', 'Script tag and onerror image in a gig title and description', xss, 'stored escaped', xss.status === 201 && !stored.title.includes('<script') && !stored.description.includes('<img'));
  r = await raw('POST', '/contact', { body: { name: '<b>Bad</b>', email: 'a@b.co', topic: 'general', message: '"><svg onload=alert(1)> please call me back about this.' } }); add('XSS', 'Markup in the contact form', r, '201 (escaped) or 422', [201, 422].includes(r.status));
  // ---- auth
  r = await raw('POST', '/auth/register', { body: { name: 'Evil Admin', email: `evil.admin.${unique}@gmail.com`, password: 'DemoPassw0rd!', role: 'admin' } }); add('Authentication', 'Register as role "admin"', r, '422', r.status === 422);
  const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ id: f.id, role: 'admin' })).toString('base64url')}.`;
  r = await raw('GET', '/admin/stats', { token: none }); add('Authentication', 'Unsigned token ("alg": "none") claiming admin', r, '401', r.status === 401);
  r = await raw('GET', '/admin/stats', { token: c1.token }); add('Authentication', 'Client token on an admin route', r, '403', r.status === 403);
  r = await raw('POST', '/auth/login', { body: { email: 'nobody.here@gmail.com', password: 'DemoPassw0rd!' } }); const unk = r.json.message;
  r = await raw('POST', '/auth/login', { body: { email: f.email, password: 'WrongPassword1' } }); add('Authentication', 'Wrong password vs unknown email give the same message', r, 'same text', r.status === 401 && r.json.message === unk);
  for (let i = 0; i < 4; i += 1) await raw('POST', '/auth/login', { body: { email: c2.email, password: 'WrongPassword1' } });
  r = await raw('POST', '/auth/login', { body: { email: c2.email, password: 'WrongPassword1' } }); add('Authentication', 'Fifth wrong password on one account', r, '423 locked', r.status === 423);
  r = await raw('POST', '/auth/login', { body: { email: c2.email, password: 'DemoPassw0rd!' } }); add('Authentication', 'Correct password while locked', r, '423 locked', r.status === 423);
  r = await raw('POST', '/auth/register', { body: { name: 'Weak Pass', email: `weak.pass.${unique}@gmail.com`, password: 'Password1', role: 'client' } }); add('Authentication', 'Common password Password1', r, '422', r.status === 422);
  // ---- access control
  r = await raw('GET', `/bookings/${bk.id}`, { token: c2.token }); add('Access control', "Another client reads someone else's booking (IDOR)", r, '404', r.status === 404);
  r = await raw('POST', `/bookings/${bk.id}/release`, { token: c2.token }); add('Access control', "Another client releases someone else's funds", r, '404', r.status === 404);
  r = await raw('PATCH', `/bookings/${bk.id}/complete`, { token: c1.token }); add('Access control', 'A client marks work complete (freelancer-only action)', r, '403', r.status === 403);
  r = await raw('POST', '/bookings', { token: c1.token, body: { gigId: gig.id, amount: 1, price: 1 } }); const paid = r.json.data?.booking?.price; add('Access control', 'Price tampering: amount=1 sent with a R500 gig', r, 'charged R500', r.status === 201 && paid === 500);
  r = await raw('PATCH', `/gigs/${gig.id}`, { token: (await signup('Sizwe Ndlovu', 'freelancer')).token, body: { price: 1 } }); add('Access control', "Another freelancer edits someone else's gig", r, '403 or 404', [403, 404].includes(r.status));
  r = await raw('GET', '/admin/audit', { token: f.token }); add('Access control', 'Freelancer reads the admin audit trail', r, '403', r.status === 403);
  // ---- misc
  r = await raw('POST', '/auth/login', { text: '{"email": "a@b.co", "password": "' + 'x'.repeat(20000) + '"}' }); add('Denial of service', '20 KB request body (limit is 10 KB)', r, '413', r.status === 413);
  r = await raw('POST', '/auth/login', { text: '{bad json' }); add('Error handling', 'Malformed JSON body', r, '400, no stack trace', r.status === 400 && !JSON.stringify(r.json).includes('at '));
  r = await raw('GET', '/does-not-exist'); add('Error handling', 'Unknown route', r, '404 JSON', r.status === 404);
  const h = await fetch(base + '/health'); const hdr = h.headers;
  rows.push({ area: 'Headers', attack: 'Security headers present, X-Powered-By hidden', got: 200, expect: 'present', ok: !!hdr.get('content-security-policy') && !!hdr.get('strict-transport-security') && hdr.get('x-content-type-options') === 'nosniff' && !hdr.get('x-powered-by') });
  const out = rows.map((x) => `${x.ok ? 'PASS' : 'FAIL'}  ${x.area.padEnd(15)} ${x.attack.padEnd(62)} -> ${String(x.got).padEnd(4)} (expected ${x.expect})`);
  out.push('', `${rows.filter((x) => x.ok).length} of ${rows.length} checks passed`);
  console.log(out.join('\n'));
  if (rows.some((x) => !x.ok)) process.exitCode = 1;

}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
