require('dotenv').config();

const PLACEHOLDER_SECRET = 'replace_this_with_a_long_random_string_before_running';
const required = ['JWT_SECRET', 'MONGODB_URI'];

function assertRequiredEnv() {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy .env.example to .env and set them before starting the server.'
    );
  }

  if (process.env.JWT_SECRET === PLACEHOLDER_SECRET) {
    throw new Error(
      'JWT_SECRET is still set to the placeholder value from .env.example. ' +
        'Set a strong, unique secret before starting the server.'
    );
  }
}

assertRequiredEnv();

const positiveInt = (value, fallback) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  httpsPort: Number(process.env.HTTPS_PORT) || 5443,
  useHttps: (process.env.USE_HTTPS || 'true').toLowerCase() === 'true',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  corsOrigin: process.env.CORS_ORIGIN || 'https://localhost:3000',
  sslKeyPath: process.env.SSL_KEY_PATH || 'certs/key.pem',
  sslCertPath: process.env.SSL_CERT_PATH || 'certs/cert.pem',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
  mongodbUri: process.env.MONGODB_URI,
  twoFactorTokenExpiresIn: process.env.TWO_FACTOR_TOKEN_EXPIRES_IN || '10m', // how long a "verify your code" session stays open
  mail: {
    // If these are all set, real emails are sent via SMTP (works with Gmail app passwords, SendGrid, Mailtrap, etc.).
    // If not, codes are logged to the server console and (outside production only) echoed back in the API response,
    // so the feature is fully testable without a mail account.
    host: process.env.SMTP_HOST || '',
    port: positiveInt(process.env.SMTP_PORT, 587),
    secure: (process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'HustleHub+ <no-reply@hustlehub.local>',
  },
  rateLimit: {
    windowMinutes: positiveInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 15),
    authMax: positiveInt(process.env.RATE_LIMIT_AUTH_MAX, 20),
    bookingMax: positiveInt(process.env.RATE_LIMIT_BOOKING_MAX, 10),
    // A broad safety net for every /api route, not a targeted control - it must stay comfortably
    // above what one legitimate test run (or a busy admin session) generates in a window, or it
    // trips first and masks the specific, lower limiters below (auth/booking/contact/otp) with its
    // own generic message. The full Postman/Newman suite alone is 300+ requests; 2000 leaves headroom
    // for that plus real usage in the same window while still catching genuine high-volume abuse.
    apiMax: positiveInt(process.env.RATE_LIMIT_API_MAX, 2000),
    contactMax: positiveInt(process.env.RATE_LIMIT_CONTACT_MAX, 5),
    otpMax: positiveInt(process.env.RATE_LIMIT_OTP_MAX, 8), // code attempts / resends per window, per IP - covers 2FA, email verification and password reset
    chatMax: positiveInt(process.env.RATE_LIMIT_CHAT_MAX, 120), // chat messages per window, per user (REST and socket both enforce this)
  },
};
