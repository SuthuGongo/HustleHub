const { body, validationResult } = require('express-validator');
const AppError = require('../utils/AppError');
const { REGISTRABLE_ROLES } = require('../utils/constants');
const { checkPassword } = require('../utils/passwordPolicy');

const registerRules = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required.')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters.')
    .escape(),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required.')
    .isEmail()
    .withMessage('A valid email address is required.')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required.')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be at least 8 characters long.')
    .matches(/\d/)
    .withMessage('Password must contain at least one number.')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter.')
    .bail()
    .custom(async (value, { req }) => {
      const problem = await checkPassword(value, { email: req.body.email, name: req.body.name });
      if (problem) throw new Error(problem);
      return true;
    }),
  // Only freelancer/client may self-register. "admin" is rejected here on purpose (privilege escalation).
  body('role')
    .trim()
    .notEmpty()
    .withMessage('Role is required.')
    .isIn(REGISTRABLE_ROLES)
    .withMessage(`Role must be one of: ${REGISTRABLE_ROLES.join(', ')}.`),
];

const loginRules = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required.')
    .isEmail()
    .withMessage('A valid email address is required.')
    .normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.'),
];

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map((e) => e.msg);
    return next(new AppError(messages.join(' '), 422));
  }
  next();
}

module.exports = { registerRules, loginRules, handleValidationErrors };
