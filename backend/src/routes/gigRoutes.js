const express = require('express');
const gigs = require('../controllers/gigController');
const authenticate = require('../middleware/authenticate');
const { optionalAuthenticate } = authenticate;
const authorize = require('../middleware/authorize');
const { handleValidationErrors } = require('../middleware/validators');
const { idParam, gigCreateRules, gigUpdateRules, gigQueryRules } = require('../middleware/resourceValidators');
const { ROLES } = require('../utils/constants');

const router = express.Router();
const freelancerOnly = authorize(ROLES.FREELANCER);

// Reading the marketplace is public (like any real marketplace); everything that changes data needs a valid JWT.
router.get('/', optionalAuthenticate, gigQueryRules, handleValidationErrors, gigs.listGigs);
router.get('/categories', gigs.getCategoryCounts); // must be declared before "/:id"
router.get('/mine', authenticate, freelancerOnly, gigs.listMyGigs);
router.get('/:id', optionalAuthenticate, idParam(), handleValidationErrors, gigs.getGig);
router.get('/:id/reviews', optionalAuthenticate, idParam(), handleValidationErrors, gigs.listGigReviews);
router.post('/', authenticate, freelancerOnly, gigCreateRules, handleValidationErrors, gigs.createGig);
router.patch('/:id', authenticate, freelancerOnly, idParam(), gigUpdateRules, handleValidationErrors, gigs.updateGig);
router.delete('/:id', authenticate, freelancerOnly, idParam(), handleValidationErrors, gigs.deleteGig);

module.exports = router;
