const express = require('express');
const conversations = require('../controllers/conversationController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { handleValidationErrors } = require('../middleware/validators');
const { idParam, startConversationRules, chatMessageRules, beforeQueryRule } = require('../middleware/resourceValidators');
const { chatLimiter } = require('../middleware/rateLimiter');
const { ROLES } = require('../utils/constants');

const router = express.Router();

// Chatting requires a real session throughout - there is no public or optionally-authenticated route here.
router.use(authenticate);

// Only a client can start a conversation ("message the seller"); a freelancer replies within one that
// already exists but never cold-starts one, which is enforced here rather than in the controller so it
// reads as a routing-level rule, the same way gig creation is freelancer-only at the router.
router.post('/', authorize(ROLES.CLIENT), chatLimiter, startConversationRules, handleValidationErrors, conversations.startConversation);
router.get('/', conversations.listConversations);
router.get('/:id/messages', idParam(), beforeQueryRule, handleValidationErrors, conversations.listMessages);
router.post('/:id/messages', idParam(), chatLimiter, chatMessageRules, handleValidationErrors, conversations.postMessage);
router.patch('/:id/read', idParam(), handleValidationErrors, conversations.markConversationRead);

module.exports = router;
