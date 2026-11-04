const mongoose = require('mongoose');
const Gig = require('../models/Gig');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const { summarise } = require('../utils/ratings');
const { containsRegex } = require('../utils/searchRegex');
const AppError = require('../utils/AppError');
const { ROLES, GIG_CATEGORIES } = require('../utils/constants');

const SORTS = {
  newest: { createdAt: -1 },
  price_asc: { price: 1, createdAt: -1 },
  price_desc: { price: -1, createdAt: -1 },
  top: { ratingAvg: -1, ratingCount: -1, createdAt: -1 },
};

// Only these fields may ever be written from a request body (prevents mass assignment,
// e.g. a client trying to set "freelancer" or "createdAt").
const WRITABLE_FIELDS = ['title', 'description', 'category', 'price', 'deliveryDays'];

function pick(source, fields) {
  return fields.reduce((acc, f) => (source[f] !== undefined ? { ...acc, [f]: source[f] } : acc), {});
}

// Loads a gig and verifies the caller owns it. 404 if missing, 403 if it belongs to someone else.
async function findOwnedGig(req) {
  const gig = await Gig.findById(req.params.id);
  if (!gig) throw new AppError('Gig not found.', 404);
  if (gig.freelancer.toString() !== req.user.id) {
    console.warn(`[SECURITY] Ownership violation: user=${req.user.id} tried ${req.method} on gig=${gig.id}`);
    throw new AppError('You do not have permission to modify this gig.', 403);
  }
  return gig;
}

// GET /api/gigs  (any authenticated user) - browse active gigs
async function listGigs(req, res, next) {
  try {
    const { q, category, minPrice, maxPrice, sort = 'newest', page = 1, limit = 12 } = req.query;

    const filter = { isActive: true };
    if (category) filter.category = category;
    if (minPrice !== undefined || maxPrice !== undefined) {
      const range = {};
      if (minPrice !== undefined) range.$gte = minPrice;
      if (maxPrice !== undefined) range.$lte = maxPrice;
      filter.price = mongoose.trusted(range); // operators we built ourselves from validated numbers
    }
    if (q) {
      const rx = containsRegex(q);
      filter.$or = [{ title: rx }, { description: rx }];
    }

    const [gigs, total] = await Promise.all([
      Gig.find(filter)
        .sort(SORTS[sort])
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('freelancer', 'name'),
      Gig.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: {
        gigs,
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/gigs/mine  (freelancer) - all of my gigs, including inactive
async function listMyGigs(req, res, next) {
  try {
    const gigs = await Gig.find({ freelancer: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: { gigs } });
  } catch (err) {
    next(err);
  }
}

// Can this (possibly anonymous) viewer see the gig? Paused gigs are visible only to their owner and admins.
function canView(gig, viewer) {
  if (gig.isActive) return true;
  if (!viewer) return false;
  return viewer.role === ROLES.ADMIN || String(gig.freelancer._id ?? gig.freelancer) === viewer.id;
}

// GET /api/gigs/:id  (public) - the gig plus a small public profile of the seller
async function getGig(req, res, next) {
  try {
    const gig = await Gig.findById(req.params.id).populate('freelancer', 'name createdAt');
    if (!gig || !canView(gig, req.user)) {
      return next(new AppError('Gig not found.', 404));
    }

    const sellerId = gig.freelancer._id;
    const [gigCount, completedOrders, sellerReviews] = await Promise.all([
      Gig.countDocuments({ freelancer: sellerId, isActive: true }),
      Booking.countDocuments({ freelancer: sellerId, status: 'completed' }),
      Review.find({ freelancer: sellerId }).select('rating'),
    ]);
    const sellerRating = summarise(sellerReviews.map((r) => r.rating));

    res.status(200).json({
      success: true,
      data: {
        gig,
        seller: {
          id: gig.freelancer.id,
          name: gig.freelancer.name,
          memberSince: gig.freelancer.createdAt,
          activeGigs: gigCount,
          completedOrders,
          ratingAvg: sellerRating.average,
          ratingCount: sellerRating.count,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/gigs/categories  (public) - how many live gigs each category has
async function getCategoryCounts(req, res, next) {
  try {
    const counts = await Promise.all(GIG_CATEGORIES.map((category) => Gig.countDocuments({ category, isActive: true })));
    res.status(200).json({
      success: true,
      data: { categories: GIG_CATEGORIES.map((category, i) => ({ category, count: counts[i] })) },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/gigs/:id/reviews  (public) - newest first, with a summary and the star distribution
async function listGigReviews(req, res, next) {
  try {
    const gig = await Gig.findById(req.params.id).select('freelancer isActive');
    if (!gig || !canView(gig, req.user)) {
      return next(new AppError('Gig not found.', 404));
    }
    const [reviews, allRatings] = await Promise.all([
      Review.find({ gig: gig.id }).sort({ createdAt: -1 }).limit(50).populate('client', 'name'),
      Review.find({ gig: gig.id }).select('rating'),
    ]);
    res.status(200).json({
      success: true,
      data: { reviews, summary: summarise(allRatings.map((r) => r.rating)) },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/gigs  (freelancer)
async function createGig(req, res, next) {
  try {
    const gig = await Gig.create({ ...pick(req.body, WRITABLE_FIELDS), freelancer: req.user.id });
    res.status(201).json({ success: true, message: 'Gig created successfully.', data: { gig } });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/gigs/:id  (freelancer who owns the gig)
async function updateGig(req, res, next) {
  try {
    const gig = await findOwnedGig(req);

    const updates = pick(req.body, [...WRITABLE_FIELDS, 'isActive']);
    if (Object.keys(updates).length === 0) {
      return next(new AppError('Provide at least one field to update.', 422));
    }

    gig.set(updates);
    await gig.save();
    res.status(200).json({ success: true, message: 'Gig updated successfully.', data: { gig } });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/gigs/:id  (freelancer who owns the gig)
async function deleteGig(req, res, next) {
  try {
    const gig = await findOwnedGig(req);
    await gig.deleteOne();
    res.status(200).json({ success: true, message: 'Gig deleted successfully.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listGigs, listMyGigs, getGig, getCategoryCounts, listGigReviews, createGig, updateGig, deleteGig };
