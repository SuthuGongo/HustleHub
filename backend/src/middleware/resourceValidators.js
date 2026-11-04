const { body, param, query } = require('express-validator');
const { GIG_CATEGORIES, CONTACT_TOPICS, MESSAGE_STATUSES } = require('../utils/constants');

// ---------- helpers ----------
const idParam = (name = 'id') =>
  param(name).isMongoId().withMessage(`A valid ${name} is required.`);

// Text is validated (type + length) and then HTML-escaped so stored values can never carry markup/script.
const requiredText = (field, label, min, max) =>
  body(field)
    .isString()
    .withMessage(`${label} must be text.`)
    .bail()
    .trim()
    .isLength({ min, max })
    .withMessage(`${label} must be between ${min} and ${max} characters.`)
    .escape();

const optionalText = (field, label, min, max) =>
  body(field)
    .optional()
    .isString()
    .withMessage(`${label} must be text.`)
    .bail()
    .trim()
    .isLength({ min, max })
    .withMessage(`${label} must be between ${min} and ${max} characters.`)
    .escape();

const priceRule = (chain) =>
  chain
    .isFloat({ min: 1, max: 1000000 })
    .withMessage('Price must be a number between R1 and R1,000,000.')
    .bail()
    .matches(/^\d+(\.\d{1,2})?$/)
    .withMessage('Price can have at most two decimal places.')
    .toFloat();

const deliveryRule = (chain) =>
  chain
    .isInt({ min: 1, max: 365 })
    .withMessage('Delivery time must be a whole number of days between 1 and 365.')
    .toInt();

const categoryRule = (chain) =>
  chain.isIn(GIG_CATEGORIES).withMessage(`Category must be one of: ${GIG_CATEGORIES.join(', ')}.`);

// ---------- gigs ----------
const gigCreateRules = [
  requiredText('title', 'Title', 5, 100),
  requiredText('description', 'Description', 20, 2000),
  categoryRule(body('category')),
  priceRule(body('price')),
  deliveryRule(body('deliveryDays')),
];

const gigUpdateRules = [
  optionalText('title', 'Title', 5, 100),
  optionalText('description', 'Description', 20, 2000),
  categoryRule(body('category').optional()),
  priceRule(body('price').optional()),
  deliveryRule(body('deliveryDays').optional()),
  body('isActive').optional().isBoolean().withMessage('isActive must be true or false.').toBoolean(true),
];

const gigQueryRules = [
  query('q')
    .optional()
    .isString()
    .withMessage('Search text must be plain text.')
    .bail()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search text must be at most 100 characters.')
    .escape(), // same escaping as stored data, so "R&B" matches a stored "R&amp;B"
  query('category').optional().isIn(GIG_CATEGORIES).withMessage('Unknown category.'),
  query('minPrice').optional().isFloat({ min: 0, max: 1000000 }).withMessage('minPrice must be a valid number.').toFloat(),
  query('maxPrice').optional().isFloat({ min: 0, max: 1000000 }).withMessage('maxPrice must be a valid number.').toFloat(),
  query('sort').optional().isIn(['newest', 'price_asc', 'price_desc', 'top']).withMessage('Unknown sort option.'),
  query('page').optional().isInt({ min: 1, max: 10000 }).withMessage('page must be a positive whole number.').toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('limit must be between 1 and 50.').toInt(),
];

// ---------- bookings ----------
// NOTE: the amount is intentionally NOT accepted from the client. Price always comes from the gig record.
const bookingCreateRules = [
  body('gigId').isMongoId().withMessage('A valid gigId is required.'),
  body('notes')
    .optional()
    .isString()
    .withMessage('Notes must be text.')
    .bail()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes must be at most 1000 characters.')
    .escape(),
];

// ---------- reviews ----------
const reviewCreateRules = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be a whole number from 1 to 5.').toInt(),
  body('comment')
    .optional()
    .isString()
    .withMessage('Comment must be text.')
    .bail()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Comment must be at most 1000 characters.')
    .escape(),
];

const issueFlagRules = [body('hasOpenIssue').isBoolean().withMessage('hasOpenIssue must be true or false.').toBoolean()];

// ---------- escrow (payment holding) ----------
const disputeCreateRules = [requiredText('reason', 'Reason', 5, 2000)];
const disputeResolveRules = [body('resolution').isIn(['released', 'refunded']).withMessage('Resolution must be either released or refunded.')];

// ---------- two-factor authentication ----------
const twoFactorTokenRule = body('twoFactorToken').isString().withMessage('Missing verification session.').bail().notEmpty();

// Either a 6-digit code OR a backup code, never neither and never both (that would be ambiguous about which check ran).
const twoFactorVerifyRules = [
  twoFactorTokenRule,
  body().custom((value) => {
    const hasCode = typeof value.code === 'string' && value.code.trim() !== '';
    const hasBackup = typeof value.backupCode === 'string' && value.backupCode.trim() !== '';
    if (hasCode === hasBackup) throw new Error('Provide either a code or a backup code.');
    return true;
  }),
  body('code').optional().isString().trim().isLength({ min: 6, max: 6 }).withMessage('Enter the 6-digit code.').isNumeric().withMessage('The code is only digits.'),
  body('backupCode').optional().isString().trim().isLength({ min: 8, max: 9 }).withMessage('Enter a valid backup code.'),
];

const twoFactorResendRules = [twoFactorTokenRule];

// ---------- registration email verification ----------
const verifyTokenRule = body('verifyToken').isString().withMessage('Missing verification session.').bail().notEmpty();
const emailVerifyRules = [
  verifyTokenRule,
  body('code').isString().withMessage('Code must be text.').bail().trim().isLength({ min: 6, max: 6 }).withMessage('Enter the 6-digit code.').isNumeric().withMessage('The code is only digits.'),
];
const emailVerifyResendRules = [verifyTokenRule];

// ---------- forgot / reset password ----------
// The same password policy as registration (middleware/validators.js), so a reset can never produce
// a weaker password than a fresh signup would have required.
const NEW_PASSWORD_RULE = body('newPassword')
  .notEmpty()
  .withMessage('Password is required.')
  .isLength({ min: 8, max: 128 })
  .withMessage('Password must be at least 8 characters long.')
  .matches(/\d/)
  .withMessage('Password must contain at least one number.')
  .matches(/[A-Z]/)
  .withMessage('Password must contain at least one uppercase letter.');

const forgotPasswordRules = [
  body('email').isString().withMessage('Email must be text.').bail().trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
];

const resetPasswordRules = [
  body('email').isString().withMessage('Email must be text.').bail().trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  body('code').isString().withMessage('Code must be text.').bail().trim().isLength({ min: 6, max: 6 }).withMessage('Enter the 6-digit code.').isNumeric().withMessage('The code is only digits.'),
  NEW_PASSWORD_RULE,
];

const twoFactorEnableConfirmRules = [
  body('code').isString().withMessage('Code must be text.').bail().trim().isLength({ min: 6, max: 6 }).withMessage('Enter the 6-digit code.').isNumeric().withMessage('The code is only digits.'),
];

const twoFactorDisableRules = [
  body('password').isString().withMessage('Password must be text.').bail().notEmpty().withMessage('Enter your password to confirm.'),
];

// ---------- contact the team ----------
const contactCreateRules = [
  requiredText('name', 'Name', 2, 80),
  body('email')
    .isString()
    .withMessage('Email must be text.')
    .bail()
    .trim()
    .isEmail()
    .withMessage('Enter a valid email address.')
    .isLength({ max: 254 })
    .withMessage('Email is too long.')
    // keep the address exactly as typed (no gmail dot/+tag stripping) so the team can reply to it
    .normalizeEmail({ gmail_remove_dots: false, gmail_remove_subaddress: false }),
  body('topic').optional().isIn(CONTACT_TOPICS).withMessage('Choose one of the listed topics.'),
  requiredText('message', 'Message', 10, 2000),
];

// ---------- admin ----------
const messageStatusRules = [body('status').isIn(MESSAGE_STATUSES).withMessage('Status must be new, read or resolved.')];
const messageReplyRules = [
  body('text')
    .isString()
    .withMessage('Reply must be text.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 8000 })
    .withMessage('Reply must be 1 to 8000 characters.')
    .escape(),
];

// The sender's own follow-up on their message - same shape as an admin's reply above, kept as a
// separate rule (rather than reused) so the two can drift independently if one side's limits ever need
// to change without touching the other.
const contactFollowUpRules = [
  body('text')
    .isString()
    .withMessage('Message must be text.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 8000 })
    .withMessage('Message must be 1 to 8000 characters.')
    .escape(),
];

// ---------- chat between client and freelancer ----------
const startConversationRules = [body('gigId').isMongoId().withMessage('A valid gig id is required.')];
// Deliberately no .escape() here: chatService.cleanText() is the one place a chat message is ever
// escaped, so REST and socket-sent messages are sanitised identically. Escaping here too would run it
// twice - which does not create a security gap, but does corrupt the text (turns "&lt;" into "&amp;lt;"
// and so on), which is exactly the bug an earlier version of this file had until a test caught it.
const chatMessageRules = [
  body('text')
    .isString()
    .withMessage('Message must be text.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 4000 })
    .withMessage('Message must be 1 to 4000 characters.'),
];
const beforeQueryRule = [query('before').optional().isISO8601().withMessage('before must be a valid date.')];
const searchQueryRule = query('search').optional().isString().trim().isLength({ max: 200 }).withMessage('Search text is too long.');
const adminMessageQueryRules = [query('status').optional().isIn(MESSAGE_STATUSES).withMessage('Unknown status.'), searchQueryRule];
const userStatusRules = [
  body('isActive').isBoolean().withMessage('isActive must be true or false.').toBoolean(true),
];

const adminUserQueryRules = [
  query('role').optional().isIn(['freelancer', 'client', 'admin']).withMessage('Unknown role.'),
  searchQueryRule,
];
const adminGigQueryRules = [searchQueryRule];
const adminTransactionQueryRules = [searchQueryRule];

module.exports = {
  idParam,
  gigCreateRules,
  gigUpdateRules,
  gigQueryRules,
  bookingCreateRules,
  reviewCreateRules,
  issueFlagRules,
  disputeCreateRules,
  disputeResolveRules,
  userStatusRules,
  adminUserQueryRules,
  adminGigQueryRules,
  adminTransactionQueryRules,
  contactCreateRules,
  messageStatusRules,
  messageReplyRules,
  contactFollowUpRules,
  startConversationRules,
  chatMessageRules,
  beforeQueryRule,
  adminMessageQueryRules,
  twoFactorVerifyRules,
  twoFactorResendRules,
  twoFactorEnableConfirmRules,
  twoFactorDisableRules,
  emailVerifyRules,
  emailVerifyResendRules,
  forgotPasswordRules,
  resetPasswordRules,
};
