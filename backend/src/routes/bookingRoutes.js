const express = require('express');
const bookings = require('../controllers/bookingController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { bookingLimiter } = require('../middleware/rateLimiter');
const { handleValidationErrors } = require('../middleware/validators');
const { idParam, bookingCreateRules, reviewCreateRules, issueFlagRules, disputeCreateRules } = require('../middleware/resourceValidators');
const { ROLES } = require('../utils/constants');

const router = express.Router();

router.use(authenticate);

router.post(
  '/',
  authorize(ROLES.CLIENT),
  bookingLimiter,
  bookingCreateRules,
  handleValidationErrors,
  bookings.createBooking
);
router.get('/', authorize(ROLES.CLIENT, ROLES.FREELANCER, ROLES.ADMIN), bookings.listBookings);
router.get('/:id', authorize(ROLES.CLIENT, ROLES.FREELANCER, ROLES.ADMIN), idParam(), handleValidationErrors, bookings.getBooking);
router.patch('/:id/complete', authorize(ROLES.FREELANCER), idParam(), handleValidationErrors, bookings.completeBooking);
router.post('/:id/release', authorize(ROLES.CLIENT), idParam(), handleValidationErrors, bookings.releaseEscrow);
router.post('/:id/dispute', authorize(ROLES.CLIENT), idParam(), disputeCreateRules, handleValidationErrors, bookings.disputeEscrow);
router.post('/:id/review', authorize(ROLES.CLIENT), idParam(), reviewCreateRules, handleValidationErrors, bookings.reviewBooking);
router.patch('/:id/issue', authorize(ROLES.CLIENT, ROLES.FREELANCER), idParam(), issueFlagRules, handleValidationErrors, bookings.setBookingIssue);

module.exports = router;
