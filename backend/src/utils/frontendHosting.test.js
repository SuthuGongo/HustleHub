/* eslint-disable security/detect-non-literal-fs-filename -- paths are built from our own build folder or a temp folder, never from user input (request paths are checked to stay inside the folder) */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const { chooseHeaders, mountFrontend } = require('./frontendHosting');

let server;
let base;
let dist;

function get(pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    http.request(base + pathname, { method }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject).end();
  });
}

beforeAll(async () => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-'));
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<html>app</html>');
  fs.writeFileSync(path.join(dist, 'assets', 'app-abc123.js'), 'console.log(1)');
  fs.writeFileSync(path.join(dist, 'robots.txt'), 'User-agent: *');

  const app = express();
  app.use(chooseHeaders((req, res, next) => { res.set('X-Api-Policy', 'strict'); next(); }));
  app.get('/api/ping', (req, res) => res.json({ ok: true }));
  mountFrontend(app, dist);
  app.use((req, res) => res.status(404).json({ route: 'not found' }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dist, { recursive: true, force: true });
});

describe('serving the built frontend from the API', () => {
  test('the home page and any client-side route return the app, never cached', async () => {
    const home = await get('/');
    const deep = await get('/gigs/123/book');
    expect(home.body).toBe('<html>app</html>');
    expect(deep.body).toBe('<html>app</html>');
    expect(deep.headers['cache-control']).toBe('no-cache');
  });

  test('pages get the page security policy; API calls keep their own', async () => {
    const page = await get('/');
    const api = await get('/api/ping');
    expect(page.headers['content-security-policy']).toContain("script-src 'self'");
    expect(page.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(page.headers['permissions-policy']).toContain('camera=()');
    expect(api.headers['x-api-policy']).toBe('strict');
    expect(api.body).toBe(JSON.stringify({ ok: true }));
  });

  test('built assets are cached for a year and a real top-level file is sent as it is', async () => {
    const asset = await get('/assets/app-abc123.js');
    const robots = await get('/robots.txt');
    expect(asset.headers['cache-control']).toContain('max-age=31536000');
    expect(robots.body).toBe('User-agent: *');
  });

  test('an unknown API path is still a 404 and is never answered with the app', async () => {
    const res = await get('/api/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body).not.toContain('app');
  });

  test('other methods are not answered with the app, and a path outside the folder is not read', async () => {
    const post = await get('/', 'POST');
    const escape = await get('/..%2f..%2fetc%2fpasswd');
    expect(post.status).toBe(404);
    expect(escape.body).toBe('<html>app</html>');
  });

  test('starting without a built app is an error that says so', () => {
    expect(() => mountFrontend(express(), path.join(os.tmpdir(), 'no-such-folder'))).toThrow(/does not exist/);
  });
});
