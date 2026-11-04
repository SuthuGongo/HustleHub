const express = require('express');
const { register, login } = require('../controllers/authController');
const twoFactor = require('../controllers/twoFactorController');
const emailVerification = require('../controllers/emailVerificationController');
const passwordReset = require('../controllers/passwordResetController');
const authenticate = require('../middleware/authenticate');
const { registerRules, loginRules, handleValidationErrors } = require('../middleware/validators');
const {
  twoFactorVerifyRules,
  twoFactorResendRules,
  twoFactorEnableConfirmRules,
  twoFactorDisableRules,
  emailVerifyRules,
  emailVerifyResendRules,
  forgotPasswordRules,
  resetPasswordRules,
} = require('../middleware/resourceValidators');
const { authLimiter, otpLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/register', authLimiter, registerRules, handleValidationErrors, register);
router.post('/login', authLimiter, loginRules, handleValidationErrors, login);

// ---- finishing registration: confirm the emailed code ----
// Carries the pending token from register()/login(), not a session token, so - like the 2FA routes
// below - this is intentionally NOT behind `authenticate`.
router.post('/verify-email', otpLimiter, emailVerifyRules, handleValidationErrors, emailVerification.verifyEmail);
router.post('/verify-email/resend', otpLimiter, emailVerifyResendRules, handleValidationErrors, emailVerification.resendVerification);

// ---- forgot / reset password ----
// Both public by nature (a person who forgot their password is, by definition, not logged in).
router.post('/forgot-password', authLimiter, forgotPasswordRules, handleValidationErrors, passwordReset.forgotPassword);
router.post('/reset-password', otpLimiter, resetPasswordRules, handleValidationErrors, passwordReset.resetPassword);

// ---- two-factor authentication ----
// Completing login: these carry the short-lived pending token from /login, not a session token,
// so they are intentionally NOT behind `authenticate` - the whole point is the person isn't
// fully logged in yet. They still sit behind their own rate limiter.
router.post('/2fa/verify', otpLimiter, twoFactorVerifyRules, handleValidationErrors, twoFactor.verifyLogin);
router.post('/2fa/resend', otpLimiter, twoFactorResendRules, handleValidationErrors, twoFactor.resend);

// Managing 2FA on your own account: these DO require a real, already-completed session.
router.get('/2fa/status', authenticate, twoFactor.status);
router.post('/2fa/enable/request', authenticate, otpLimiter, twoFactor.requestEnable);
router.post('/2fa/enable/confirm', authenticate, otpLimiter, twoFactorEnableConfirmRules, handleValidationErrors, twoFactor.confirmEnable);
router.post('/2fa/disable', authenticate, twoFactorDisableRules, handleValidationErrors, twoFactor.disable);

module.exports = router;
