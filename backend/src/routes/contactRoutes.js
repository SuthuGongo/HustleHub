const express = require('express');
const contact = require('../controllers/contactController');
const authenticate = require('../middleware/authenticate');
const { contactLimiter } = require('../middleware/rateLimiter');
const { handleValidationErrors } = require('../middleware/validators');
const { idParam, contactCreateRules, contactFollowUpRules } = require('../middleware/resourceValidators');

const router = express.Router();

// Anyone may write to the team, so this route is public but rate limited and fully validated.
router.post('/', contactLimiter, authenticate.optionalAuthenticate, contactCreateRules, handleValidationErrors, contact.createMessage);

// Seeing your own past messages (and any replies) is only ever for the account that sent them, so
// these all require a real, completed session - not just "a token was present" like the line above.
router.get('/mine', authenticate, contact.listMine);
router.patch('/mine/seen', authenticate, contact.markMineSeen);
router.post('/mine/:id/reply', authenticate, contactLimiter, idParam(), contactFollowUpRules, handleValidationErrors, contact.replyToMine);

module.exports = router;
