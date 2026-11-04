const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');

const CERTS_DIR = path.join(__dirname, '..', 'certs');

async function main() {
  fs.mkdirSync(CERTS_DIR, { recursive: true });

  const keyPath = path.join(CERTS_DIR, 'key.pem');
  const certPath = path.join(CERTS_DIR, 'cert.pem');

  const notAfter = new Date();
  notAfter.setDate(notAfter.getDate() + 365);

  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = await selfsigned.generate(attrs, {
    keySize: 2048,
    notAfterDate: notAfter,
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
        ],
      },
    ],
  });

  // The 'wx' flag creates each file only if it does not already exist, so there is no gap between
  // checking and writing for another process to slip into. An existing certificate is left untouched.
  try {
    fs.writeFileSync(keyPath, pems.private, { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(certPath, pems.cert, { flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') {
      console.log('Certificate already exists at backend/certs/. Delete the files there first if you want to regenerate.');
      return;
    }
    throw err;
  }

  console.log('Self-signed certificate generated:');
  console.log(`  ${keyPath}`);
  console.log(`  ${certPath}`);
}

main().catch((err) => {
  console.error('Certificate generation failed:', err);
  process.exit(1);
});
