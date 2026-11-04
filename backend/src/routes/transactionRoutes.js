const express = require('express');
const transactions = require('../controllers/transactionController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { ROLES } = require('../utils/constants');

const router = express.Router();

router.use(authenticate);

router.get('/', authorize(ROLES.CLIENT, ROLES.FREELANCER, ROLES.ADMIN), transactions.listTransactions);
router.get('/income', authorize(ROLES.FREELANCER), transactions.getIncomeSummary);

module.exports = router;
