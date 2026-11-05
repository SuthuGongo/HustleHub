const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const app = require('./app');
const { port, httpsPort, useHttps, sslKeyPath, sslCertPath } = require('./config/env');
const { connectDb, disconnectDb } = require('./config/db');
const { initChatSocket } = require('./sockets/chatSocket');
const logger = require('./utils/logger');

logger.installProcessHandlers();

function resolvePath(p) {
  return path.isAbsolute(p) ? p : path.join(__dirname, '..', p);
}

function startServer() {
  const keyPath = resolvePath(sslKeyPath);
  const certPath = resolvePath(sslCertPath);
  const certsExist = fs.existsSync(keyPath) && fs.existsSync(certPath);

  let server;
  if (useHttps && certsExist) {
    const options = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
    server = https.createServer(options, app).listen(httpsPort, () => {
      logger.info('server.started', { protocol: 'https', port: httpsPort });
      console.log(`HustleHub+ API listening securely on https://localhost:${httpsPort}`);
    });
  } else {
    if (useHttps && !certsExist) {
      console.warn(
        'USE_HTTPS is true but no SSL certificate was found. Run "npm run gen-cert" to generate one. Falling back to HTTP for now.'
      );
    }
    server = http.createServer(app).listen(port, () => {
      logger.info('server.started', { protocol: 'http', port });
      console.log(`HustleHub+ API listening on http://localhost:${port} (HTTP - dev fallback)`);
    });
  }
  return server;
}

async function main() {
  await connectDb();
  const server = startServer();
  initChatSocket(server); // attaches Socket.IO to the same HTTP(S) server - one port, one certificate, for both REST and real-time chat

  const shutdown = async (signal) => {
    logger.info('server.shutdown', { signal });
    server.close(async () => {
      await disconnectDb();
      await logger.flush(); // last entries reach the log service before the process ends
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  // Deliberately short: connection strings and stack traces must not be dumped to the console.
  logger.error('server.start_failed', { message: err.message });
  logger.flush().finally(() => process.exit(1));
});
