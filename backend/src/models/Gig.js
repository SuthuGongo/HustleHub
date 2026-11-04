const mongoose = require('mongoose');
const cleanJson = require('../utils/toJSON');
const { GIG_CATEGORIES } = require('../utils/constants');

const gigSchema = new mongoose.Schema(
  {
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 700 },
    description: { type: String, required: true, trim: true, maxlength: 14000 },
    category: { type: String, enum: GIG_CATEGORIES, required: true, index: true },
    price: { type: Number, required: true, min: 1, max: 1000000 }, // Rand (ZAR)
    deliveryDays: { type: Number, required: true, min: 1, max: 365, validate: Number.isInteger },
    isActive: { type: Boolean, default: true },
    // Denormalised from the Review collection (recomputed whenever a review is added) so browsing can sort/show ratings cheaply.
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

gigSchema.plugin(cleanJson);

module.exports = mongoose.model('Gig', gigSchema);
