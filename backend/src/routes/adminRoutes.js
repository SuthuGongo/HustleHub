const express = require('express');
const admin = require('../controllers/adminController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { handleValidationErrors } = require('../middleware/validators');
const {
  idParam,
  userStatusRules,
  adminUserQueryRules,
  adminGigQueryRules,
  adminTransactionQueryRules,
  messageStatusRules,
  messageReplyRules,
  adminMessageQueryRules,
  disputeResolveRules,
} = require('../middleware/resourceValidators');
const { ROLES } = require('../utils/constants');

const router = express.Router();

// Everything under /api/admin requires a valid JWT *and* the admin role.
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/stats', admin.getStats);
router.get('/report', admin.downloadReport);
router.get('/users', adminUserQueryRules, handleValidationErrors, admin.listUsers);
router.patch('/users/:id/status', idParam(), userStatusRules, handleValidationErrors, admin.setUserStatus);
router.get('/gigs', adminGigQueryRules, handleValidationErrors, admin.listAllGigs);
router.delete('/gigs/:id', idParam(), handleValidationErrors, admin.deleteAnyGig);
router.get('/transactions', adminTransactionQueryRules, handleValidationErrors, admin.listAllTransactions);
router.get('/escrow', admin.listEscrow);
router.get('/disputes', admin.listDisputes);
router.post('/disputes/:id/resolve', idParam(), disputeResolveRules, handleValidationErrors, admin.resolveDispute);
router.get('/messages', adminMessageQueryRules, handleValidationErrors, admin.listMessages);
router.patch('/messages/:id/status', idParam(), messageStatusRules, handleValidationErrors, admin.setMessageStatus);
router.post('/messages/:id/reply', idParam(), messageReplyRules, handleValidationErrors, admin.replyToMessage);

module.exports = router;
