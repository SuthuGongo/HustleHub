const mongoose = require('mongoose');
const SignIn = require('../models/SignIn');
const logger = require('./logger');

const KEEP = 50;

// Records a successful sign-in. Never throws: a failure here must not stop someone logging in.
async function recordSignIn(user, req, method) {
  try {
    await SignIn.create({
      user: user._id,
      ip: String(req.ip || '').slice(0, 64),
      userAgent: String(req.get('user-agent') || '').slice(0, 300),
      method,
    });
    // Keep the newest KEEP rows per person; the ids come from our own query, so they are marked trusted.
    const surplus = await SignIn.find({ user: user._id }).sort({ at: -1 }).skip(KEEP).select('_id').lean();
    if (surplus.length) await SignIn.deleteMany({ _id: mongoose.trusted({ $in: surplus.map((r) => r._id) }) });
  } catch (err) {
    logger.warn('security.sign_in_not_recorded', { userId: user.id, error: err.message });
  }
}

async function listRecentSignIns(userId, limit = 10) {
  const rows = await SignIn.find({ user: userId }).sort({ at: -1 }).limit(limit).lean();
  return rows.map((r) => ({ id: String(r._id), at: r.at, ip: r.ip, userAgent: r.userAgent, method: r.method }));
}

module.exports = { recordSignIn, listRecentSignIns };
