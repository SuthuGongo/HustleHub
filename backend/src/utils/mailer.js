const nodemailer = require('nodemailer');
const { mail, isProduction, nodeEnv } = require('../config/env');

const smtpConfigured = Boolean(mail.host && mail.user && mail.pass);

// Test mode only: a small in-memory "inbox" of the most recent dev-mode message per recipient, so the
// automated test suite can check what a message said (e.g. the code inside it) the same way a human
// tester would by actually opening their email - without the API itself ever revealing that content in
// a response. This never exists outside NODE_ENV=test, and never affects delivery, only observability.
const testInbox = nodeEnv === 'test' ? new Map() : null;
function readTestInbox(to) {
  return testInbox ? testInbox.get(to) || null : null;
}

let transporter = null;
function getTransporter() {
  if (!smtpConfigured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      auth: { user: mail.user, pass: mail.pass },
    });
  }
  return transporter;
}

// Sends an email. `html` is optional - every branded template in utils/emailTemplates.js supplies
// one, but a caller can omit it for a plain-text-only message. `text` is always sent too, as the
// alternative part: some inboxes and every spam filter prefer having one, and it's what shows in
// notification previews.
async function sendMail({ to, subject, text, html }) {
  const t = getTransporter();
  if (t) {
    await t.sendMail({ from: mail.from, to, subject, text, ...(html ? { html } : {}) });
    return { delivered: true };
  }

  // No SMTP configured. Never silently fail: log the full message to the SERVER's own console
  // (never returned in any API response) so the feature stays fully testable end to end - this
  // matters most for password reset, whose API response is deliberately identical whether or not
  // the account exists, so it can never hand the code back to the caller the way other flows do.
  if (isProduction) {
    throw new Error('Email delivery is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS.');
  }
  // Line breaks are stripped from anything a user can influence before it is logged, so it cannot forge extra log lines.
  const oneLine = (v) => String(v).replace(/\n|\r/g, '');
  // Each body line is cleaned and logged on its own, indented, so text typed by a user cannot pass for a log entry.
  const bodyLines = String(text).split(/\r?\n/).map((line) => `    ${oneLine(line)}`).join('\n');
  console.log(`[mailer] SMTP not configured; would have sent to ${oneLine(to)}: ${oneLine(subject)}\n${bodyLines}`);
  if (testInbox) testInbox.set(to, { subject, text, at: new Date().toISOString() });
  return { delivered: false };
}

module.exports = { sendMail, smtpConfigured, readTestInbox };
