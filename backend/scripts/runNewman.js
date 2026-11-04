// One-command API test run:  npm run test:api
//
// 1. starts a *separate* HustleHub+ API instance (own port, own "hustlehub_test" database,
//    relaxed auth limit so repeated runs are not blocked),
// 2. seeds the test administrator,
// 3. executes the Postman collection with Newman (HTML + JSON reports are written to postman/reports/),
// 4. stops the server and exits non-zero if any assertion failed (CI-friendly).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn, spawnSync } = require('child_process');
const newman = require('newman');

// `npm run test:api:coverage` also records which lines of the API the requests ran (V8 coverage on the
// server process), then writes backend/coverage/lcov.info for SonarCloud.
const withCoverage = process.argv.includes('--coverage');
const coverageTmpDir = path.join(__dirname, '..', 'coverage', 'tmp');

const backendDir = path.join(__dirname, '..');
const postmanDir = path.join(backendDir, '..', 'postman');
const reportsDir = path.join(postmanDir, 'reports');
const collectionPath = path.join(postmanDir, 'HustleHub.postman_collection.json');
const certPath = path.join(backendDir, 'certs', 'cert.pem'); // the locally generated certificate the test server uses
const environmentPath = path.join(postmanDir, 'HustleHub-Local.postman_environment.json');

const TEST_PORT = Number(process.env.TEST_HTTPS_PORT) || 5444;
const baseUrl = `https://localhost:${TEST_PORT}/api`;

function testDatabaseUri() {
  if (process.env.MONGODB_URI_TEST) return process.env.MONGODB_URI_TEST;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set. Copy .env.example to .env first.');
  // Plain string handling rather than a regular expression: keep "mongodb://host", swap the database name.
  const schemeEnd = uri.indexOf('://');
  const scheme = schemeEnd < 0 ? '' : uri.slice(0, schemeEnd);
  if (scheme !== 'mongodb' && scheme !== 'mongodb+srv') return uri;
  const hostStart = schemeEnd + 3;
  const slash = uri.indexOf('/', hostStart);
  const queryStart = uri.indexOf('?', hostStart);
  const ends = [slash, queryStart].filter((i) => i !== -1);
  const hostEnd = ends.length ? Math.min(...ends) : uri.length;
  if (hostEnd === hostStart) return uri;
  const query = queryStart === -1 ? '' : uri.slice(queryStart);
  return `${uri.slice(0, hostEnd)}/hustlehub_test${query}`; // same server, separate database
}

function readAdminCredentials() {
  const env = JSON.parse(fs.readFileSync(environmentPath, 'utf-8'));
  const get = (key) => env.values.find((v) => v.key === key).value;
  return { email: get('adminEmail'), password: get('adminPassword') };
}

function waitForHealth(timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = https.get(`${baseUrl}/health`, { ca: fs.readFileSync(certPath) }, (res) => {
        res.resume();
        res.statusCode === 200 ? resolve() : retry();
      });
      req.on('error', retry);
    };
    const retry = () =>
      Date.now() - started > timeoutMs ? reject(new Error('Test server did not become healthy in time.')) : setTimeout(attempt, 400);
    attempt();
  });
}

function writeLcov() {
  const reportDir = path.join(backendDir, 'coverage');
  const c8Bin = path.join(backendDir, 'node_modules', 'c8', 'bin', 'c8.js');
  const result = spawnSync(
    process.execPath,
    [c8Bin, 'report', `--temp-directory=${coverageTmpDir}`, '--reporter=lcovonly', `--report-dir=${reportDir}`, '--include=src/**', '--exclude=**/*.test.js', '--exclude=**/__tests__/**'],
    { cwd: backendDir, encoding: 'utf-8' }
  );
  if (result.status !== 0) throw new Error(`Coverage report failed:\n${result.stdout}${result.stderr}`);
  // SonarCloud scans from the repository root, so make the file paths root-relative.
  const lcovPath = path.join(reportDir, 'lcov.info');
  const fixed = fs.readFileSync(lcovPath, 'utf-8').replace(/^SF:/gm, 'SF:backend/');
  fs.writeFileSync(lcovPath, fixed);
  console.log(`> Coverage written to ${path.relative(process.cwd(), lcovPath) || lcovPath}`);
}

async function main() {
  ['certs/key.pem', 'certs/cert.pem'].forEach((f) => {
    if (!fs.existsSync(path.join(backendDir, f))) throw new Error(`Missing ${f}. Run "npm run gen-cert" first.`);
  });
  fs.mkdirSync(reportsDir, { recursive: true });

  const admin = readAdminCredentials();
  const testEnv = {
    ...process.env,
    NODE_ENV: 'test',
    EXPOSE_TEST_CODES: 'true', // lets the API return email codes ONLY for this test run - see services/otpService.js
    USE_HTTPS: 'true',
    HTTPS_PORT: String(TEST_PORT),
    MONGODB_URI: testDatabaseUri(),
    RATE_LIMIT_AUTH_MAX: '60', // real default is 20; a full run makes ~30 auth calls and the last folder trips the limit on purpose
    RATE_LIMIT_BOOKING_MAX: '10',
    RATE_LIMIT_API_MAX: '2000',
    RATE_LIMIT_CONTACT_MAX: '30', // real default is 5; the contact folder sends a dozen requests, and the last folder trips it on purpose
    RATE_LIMIT_OTP_MAX: '100', // real default is 8; email verification, 2FA and password reset together make dozens of legitimate calls in one run
    ...(withCoverage ? { NODE_V8_COVERAGE: coverageTmpDir } : {}),
    ADMIN_EMAIL: admin.email,
    ADMIN_PASSWORD: admin.password,
  };

  console.log('> Seeding test administrator...');
  const seed = spawnSync(process.execPath, ['scripts/seedAdmin.js'], { cwd: backendDir, env: testEnv, encoding: 'utf-8' });
  if (seed.status !== 0) throw new Error(`Admin seeding failed:\n${seed.stdout}${seed.stderr}`);

  console.log(`> Starting test API on ${baseUrl} ...`);
  const logStream = fs.createWriteStream(path.join(reportsDir, 'server.log'));
  const server = spawn(process.execPath, ['src/server.js'], { cwd: backendDir, env: testEnv });
  server.stdout.pipe(logStream);
  server.stderr.pipe(logStream);
  const stop = () => server.kill('SIGTERM');
  process.on('exit', stop);

  try {
    await waitForHealth();
  } catch (err) {
    stop();
    throw err;
  }

  console.log('> Running Postman collection with Newman...\n');
  const summary = await new Promise((resolve, reject) => {
    newman.run(
      {
        collection: collectionPath,
        environment: environmentPath,
        envVar: [{ key: 'baseUrl', value: baseUrl }],
        sslExtraCaCerts: certPath, // trust the local self-signed certificate; verification stays on
        reporters: ['cli', 'htmlextra', 'json'],
        reporter: {
          htmlextra: { export: path.join(reportsDir, 'newman-report.html'), title: 'HustleHub+ API Test Report' },
          json: { export: path.join(reportsDir, 'newman-report.json') },
        },
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
  });

  stop();
  if (withCoverage) {
    // The server writes its coverage data as it exits, so wait for that before reading it.
    await new Promise((resolve) => {
      if (server.exitCode !== null) return resolve();
      server.once('exit', resolve);
      setTimeout(resolve, 10000);
    });
    writeLcov();
  }

  const { assertions, requests } = summary.run.stats;
  console.log(`\nRequests: ${requests.total} | Assertions: ${assertions.total} | Failed assertions: ${assertions.failed}`);
  console.log(`Reports written to ${path.relative(process.cwd(), reportsDir) || reportsDir}`);
  process.exit(assertions.failed > 0 || summary.run.failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nAPI test run failed to complete:', err.message);
  process.exit(2);
});
