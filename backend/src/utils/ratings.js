const Gig = require('../models/Gig');
const Review = require('../models/Review');

const round1 = (n) => Math.round((n + Number.EPSILON) * 10) / 10;

// Summarises an array of ratings (numbers 1-5): average, count and how many people gave each star.
function summarise(ratings) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  ratings.forEach((r) => {
    if (distribution[r] !== undefined) distribution[r] += 1;
  });
  const count = ratings.length;
  const average = count ? round1(ratings.reduce((a, b) => a + b, 0) / count) : 0;
  return { average, count, distribution };
}

// Recomputes and stores a gig's rating from its reviews (safe against races: it always re-reads the truth).
async function refreshGigRating(gigId) {
  const reviews = await Review.find({ gig: gigId }).select('rating');
  const { average, count } = summarise(reviews.map((r) => r.rating));
  await Gig.updateOne({ _id: gigId }, { ratingAvg: average, ratingCount: count });
  return { ratingAvg: average, ratingCount: count };
}

module.exports = { summarise, refreshGigRating, round1 };
