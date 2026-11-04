// Shared engine behind every one-time email code in the app: 2FA login, turning 2FA on, verifying a
// new account's email, and resetting a forgotten password. One well-tested implementation, reused
// everywhere a code is issued or checked, rather than four similar-but-subtly-different copies.
const TwoFactorCode = require('../models/TwoFactorCode');
const AppError = require('../utils/AppError');
const { sendMail } = require('../utils/mailer');
const { codeEmailHtml } = require('../utils/emailTemplates');
const { MAX_ATTEMPTS, CODE_TTL_MS, generateCode, hashCode, codeMatches } = require('../utils/twoFactor');

// Subject line and the wording inside the email both vary by purpose, so the same code-delivery
// mechanism reads naturally whichever flow is asking for it, rather than one generic "here's a code".
const COPY = {
  login: { subject: 'Your login code - HustleHub+', heading: 'Your login code', intro: 'Enter this code to finish logging in to HustleHub+.' },
  enable: { subject: 'Confirm two-factor authentication - HustleHub+', heading: 'Confirm two-factor authentication', intro: 'Enter this code to turn on two-factor authentication for your account.' },
  verify_email: { subject: 'Verify your email - HustleHub+', heading: 'Verify your email', intro: 'Enter this code to finish creating your HustleHub+ account.' },
  reset_password: { subject: 'Reset your password - HustleHub+', heading: 'Reset your password', intro: 'Enter this code to choose a new password for your account.' },
};

// Registration and resend responses never carry the code to a browser (it reaches the person by email,
// or in the server's own console when SMTP is not configured). The automated API test run is the one
// exception: Newman cannot read a server console, so when - and only when - the server was started by
// the test runner (NODE_ENV=test AND EXPOSE_TEST_CODES=true, both set by scripts/runNewman.js) the code
// is echoed back so the suite can finish a registration. Neither variable is set in development, in
// Docker, or on Render, so this can never be reached on a real deployment.
const testRunCode = (devCode) =>
  process.env.NODE_ENV === 'test' && process.env.EXPOSE_TEST_CODES === 'true' ? devCode : undefined;

const maskEmail = (email) => {
  const [name, domain] = email.split('@');
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${'*'.repeat(Math.max(3, name.length - visible.length))}@${domain}`;
};

// Creates a fresh code for (user, purpose), invalidating any earlier unconsumed one for the same
// purpose so only the most recently sent code can ever be accepted, and emails it.
async function issueCode(user, purpose) {
  await TwoFactorCode.deleteMany({ user: user.id, purpose, consumedAt: null });
  const code = generateCode();
  await TwoFactorCode.create({
    user: user.id,
    purpose,
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  const { subject, heading, intro } = COPY[purpose];
  const text =
    `Your verification code is ${code}\n\n` +
    'It expires in 10 minutes and can be used once. If you did not request this, you can ignore this ' +
    'email - your account is safe as long as your password stays private.';
  const html = codeEmailHtml({ heading, intro, code });
  const { delivered } = await sendMail({ to: user.email, subject, text, html });

  // devCode exists purely so this feature works end-to-end without a mail account configured, the same
  // way payments are "simulated" elsewhere in this app; sendMail() already refuses to reach this branch
  // in production without real SMTP configured, so devCode can never appear on a live deployment.
  return { maskedEmail: maskEmail(user.email), devCode: delivered ? undefined : code };
}

// Checks a submitted code against the newest unconsumed one for (user, purpose), enforcing the
// attempt limit and expiry, and marks it consumed on success so it cannot be replayed.
async function checkCode(userId, purpose, submitted) {
  const record = await TwoFactorCode.findOne({ user: userId, purpose, consumedAt: null }).sort({ createdAt: -1 });
  if (!record || record.expiresAt < new Date()) {
    throw new AppError('That code has expired. Request a new one.', 401);
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    throw new AppError('Too many incorrect attempts. Request a new code.', 401);
  }
  if (!codeMatches(submitted, record.codeHash)) {
    record.attempts += 1;
    await record.save();
    const left = MAX_ATTEMPTS - record.attempts;
    throw new AppError(
      left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many incorrect attempts. Request a new code.',
      401
    );
  }
  record.consumedAt = new Date();
  await record.save();
}

module.exports = {
  testRunCode, issueCode, checkCode, maskEmail };
