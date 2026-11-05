const express = require('express');
const { getCurrentUser, getMySignIns } = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

router.get('/me', authenticate, getCurrentUser);
router.get('/me/sign-ins', authenticate, getMySignIns);

module.exports = router;
