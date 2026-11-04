const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const { corsOrigin, nodeEnv, useHttps } = require('./config/env');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const gigRoutes = require('./routes/gigRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const adminRoutes = require('./routes/adminRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const contactRoutes = require('./routes/contactRoutes');
const sanitizeInput = require('./middleware/sanitizeInput');
const { apiLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

// ---- Security headers (Helmet) ----
// This service only ever returns JSON, so its Content-Security-Policy can be as strict as possible:
// nothing may be loaded, framed, or submitted to from a response of this API.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
        ...(useHttps ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-site' },
    // X-Content-Type-Options: nosniff, X-Frame-Options, COOP, hidden X-Powered-By etc. stay on Helmet defaults.
  })
);

app.use(
  cors({
    origin: corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  })
);

// API responses can contain personal / financial data: never let browsers or proxies cache them.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use(express.json({ limit: '10kb' }));
app.use(sanitizeInput); // strips $operators / prototype-pollution keys from the body

app.use(morgan(nodeEnv === 'production' ? 'combined' : 'dev'));

app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'HustleHub+ API is running.' });
});

app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/gigs', gigRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/conversations', conversationRoutes);

// Test-only, and only ever mounted under NODE_ENV=test (this project's isolated `npm run test:api`
// environment - never dev, never production): lets the automated suite check what the most recent
// dev-mode email to an address said, the same way a real tester would by opening their inbox, without
// the real API (forgotPassword above all) ever having to reveal that content in its own response.
if (nodeEnv === 'test') {
  const { readTestInbox } = require('./utils/mailer');
  app.get('/api/_test/last-email', (req, res) => {
    const message = readTestInbox(String(req.query.to || ''));
    if (!message) return res.status(404).json({ success: false, message: 'No test-mode email found for that address.' });
    res.status(200).json({ success: true, data: message });
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
