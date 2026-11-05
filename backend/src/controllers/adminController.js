const mongoose = require('mongoose');
const validator = require('validator');
const User = require('../models/User');
const Gig = require('../models/Gig');
const Booking = require('../models/Booking');
const Transaction = require('../models/Transaction');
const ContactMessage = require('../models/ContactMessage');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { sendMail } = require('../utils/mailer');
const { replyEmailHtml } = require('../utils/emailTemplates');
const { emitToUser } = require('../services/socketService');
const { roundMoney } = require('../utils/money');
const { containsRegex } = require('../utils/searchRegex');
const { releaseExpiredEscrows } = require('../utils/escrow');
const { ROLES, MESSAGE_STATUSES } = require('../utils/constants');

const withPeople = (query) => query.populate('client', 'name').populate('freelancer', 'name').populate('resolvedBy', 'name');

// GET /api/admin/users?role=&search=  - search matches a name or email that CONTAINS the text typed,
// so "aisha" finds "Aisha Naidoo" and "@gmail" finds every Gmail address, without needing an exact match.
async function listUsers(req, res, next) {
  try {
    const filter = req.query.role ? { role: { $eq: String(req.query.role) } } : {};
    if (req.query.search) {
      const rx = containsRegex(String(req.query.search));
      filter.$or = [{ name: rx }, { email: rx }];
    }
    const users = await User.find(filter).sort({ createdAt: -1 }).limit(500);
    res.status(200).json({ success: true, data: { users } });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/users/:id/status  { isActive: boolean }
async function setUserStatus(req, res, next) {
  try {
    if (req.params.id === req.user.id) {
      return next(new AppError('You cannot change the status of your own account.', 400));
    }
    const user = await User.findById(req.params.id);
    if (!user) return next(new AppError('User not found.', 404));
    if (user.role === ROLES.ADMIN) {
      return next(new AppError('Administrator accounts cannot be disabled here.', 403));
    }
    user.isActive = req.body.isActive;
    await user.save();
    logger.warn('admin.user.status_changed', { adminId: req.user.id, userId: user.id, isActive: user.isActive, requestId: req.id });
    res.status(200).json({
      success: true,
      message: user.isActive ? 'User enabled.' : 'User disabled.',
      data: { user },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/gigs?search=  - every gig, including inactive ones; search matches the gig's own
// title or the freelancer's name (a quick two-step lookup, since "who sells this" is often exactly
// what an admin is trying to find rather than the gig's own wording).
async function listAllGigs(req, res, next) {
  try {
    const filter = {};
    if (req.query.search) {
      const rx = containsRegex(String(req.query.search));
      const matchingFreelancers = await User.find({ name: rx }).select('_id');
      // $in is built here from ids we looked up ourselves, not from user input, so it is marked trusted
      // (see gigController.js for why the sanitizeFilter setting makes that necessary).
      filter.$or = [{ title: rx }, { freelancer: mongoose.trusted({ $in: matchingFreelancers.map((u) => u._id) }) }];
    }
    const gigs = await Gig.find(filter).sort({ createdAt: -1 }).limit(500).populate('freelancer', 'name');
    res.status(200).json({ success: true, data: { gigs } });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/gigs/:id - moderation
async function deleteAnyGig(req, res, next) {
  try {
    const gig = await Gig.findById(req.params.id);
    if (!gig) return next(new AppError('Gig not found.', 404));
    await gig.deleteOne();
    logger.warn('admin.gig.removed', { adminId: req.user.id, gigId: gig.id, ownerId: gig.freelancer, requestId: req.id });
    res.status(200).json({ success: true, message: 'Gig removed by administrator.' });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/transactions
// GET /api/admin/transactions?search=  - matches the reference, the gig title, or either party's name.
async function listAllTransactions(req, res, next) {
  try {
    const filter = {};
    if (req.query.search) {
      const rx = containsRegex(String(req.query.search));
      const matchingUsers = await User.find({ name: rx }).select('_id');
      const userIds = matchingUsers.map((u) => u._id);
      filter.$or = [{ reference: rx }, { gigTitle: rx }, { client: mongoose.trusted({ $in: userIds }) }, { freelancer: mongoose.trusted({ $in: userIds }) }];
    }
    const transactions = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .populate('client', 'name')
      .populate('freelancer', 'name');
    res.status(200).json({ success: true, data: { transactions } });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/escrow  - every booking whose funds are currently held (either freshly paid, or
// completed and sitting in the client's review window). The "active bookings" view you'd check to
// see how much money is currently sitting with the platform, and for how long.
async function listEscrow(req, res, next) {
  try {
    await releaseExpiredEscrows(); // don't show a booking as "held" if its window quietly expired already
    const bookings = await withPeople(
      // $in is an operator we built ourselves, not from user input - see gigController.js for the same pattern
      Booking.find({ escrowStatus: mongoose.trusted({ $in: ['held', 'awaiting_review'] }) }).sort({ createdAt: -1 }).limit(500)
    );
    const totalHeld = roundMoney(bookings.reduce((sum, b) => sum + b.price, 0));
    res.status(200).json({ success: true, data: { bookings, totalHeld } });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/disputes  - bookings a client has flagged during their review window, oldest first
// (the ones waiting longest for a decision surface first).
async function listDisputes(req, res, next) {
  try {
    const bookings = await withPeople(Booking.find({ escrowStatus: 'disputed' }).sort({ disputedAt: 1 }).limit(500));
    res.status(200).json({ success: true, data: { bookings } });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/disputes/:id/resolve  { resolution: 'released' | 'refunded' }
// All-or-nothing by design: an admin either releases the full amount to the freelancer or refunds the
// full amount to the client - no partial splits.
async function resolveDispute(req, res, next) {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return next(new AppError('Booking not found.', 404));
    if (booking.escrowStatus !== 'disputed') {
      return next(new AppError('This booking is not currently disputed.', 409));
    }
    const { resolution } = req.body;
    booking.escrowStatus = resolution;
    booking.resolution = resolution;
    booking.resolvedAt = new Date();
    booking.resolvedBy = req.user.id;
    await booking.save();

    // A refund sends the money back to the client, so the payment record must stop counting as the
    // freelancer's income (and as platform volume). Without this the freelancer's income overview kept
    // showing money that had already been returned.
    if (resolution === 'refunded') {
      await Transaction.updateOne({ booking: booking._id }, { $set: { status: 'refunded', refundedAt: booking.resolvedAt } });
    }
    logger.info(resolution === 'refunded' ? 'transaction.refunded' : 'booking.dispute_released', { bookingId: booking.id, adminId: req.user.id, clientId: booking.client, freelancerId: booking.freelancer, amount: booking.price, requestId: req.id });
    const populated = await withPeople(Booking.findById(booking.id));
    res.status(200).json({
      success: true,
      message: resolution === 'released' ? 'Funds released to the freelancer.' : 'Funds refunded to the client.',
      data: { booking: populated },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/stats
async function getStats(req, res, next) {
  try {
    const DAYS = 14;
    // The trend must end on TODAY, not "DAYS days ago to yesterday" - anchor on the start of today (UTC)
    // and count back (DAYS - 1) more days, so the window is exactly DAYS days long and today is always
    // the last point. (An earlier version anchored on `today - DAYS days` for both the window start and
    // the array generation, which produced a correctly-sized array that silently excluded today itself -
    // caught by seeing today's real transactions missing from an otherwise populated chart.)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const since = new Date(today.getTime() - (DAYS - 1) * 24 * 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      users,
      freelancers,
      clients,
      admins,
      newUsersThisWeek,
      gigs,
      activeGigs,
      gigsByCategory,
      bookings,
      bookingsByStatus,
      transactionCount,
      [volume],
      dailyVolume,
      newMessages,
      recentUsers,
      recentBookings,
      recentMessages,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: ROLES.FREELANCER }),
      User.countDocuments({ role: ROLES.CLIENT }),
      User.countDocuments({ role: ROLES.ADMIN }),
      User.countDocuments({ createdAt: mongoose.trusted({ $gte: weekAgo }) }), // an operator we built ourselves, not from user input - see gigController.js for the same pattern
      Gig.countDocuments({}),
      Gig.countDocuments({ isActive: true }),
      Gig.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
      Booking.countDocuments({}),
      Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Transaction.countDocuments({}),
      // Refunded payments were returned to the client, so they are not platform volume.
      Transaction.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      // The last two weeks of transactions, bucketed into days in application code rather than with a
      // $dateToString aggregation stage: that operator isn't implemented on every MongoDB-compatible
      // database (FerretDB, used in this project's own test environment, is one), and the admin-only,
      // 14-day-bounded dataset here is small enough that grouping in JS costs nothing in practice.
      Transaction.find({ status: 'completed', createdAt: mongoose.trusted({ $gte: since }) }).select('amount createdAt'),
      ContactMessage.countDocuments({ status: 'new' }),
      User.find().sort({ createdAt: -1 }).limit(5).select('name role createdAt'),
      Booking.find().sort({ createdAt: -1 }).limit(5).select('gigTitle price status createdAt client freelancer').populate('client', 'name').populate('freelancer', 'name'),
      ContactMessage.find().sort({ createdAt: -1 }).limit(5).select('name topic status createdAt'),
    ]);

    // Fill in every day in the window, even ones with zero transactions, so the chart never has a gap.
    const byDay = {};
    for (const t of dailyVolume) {
      const key = t.createdAt.toISOString().slice(0, 10);
      byDay[key] = byDay[key] || { total: 0, count: 0 };
      byDay[key].total += t.amount;
      byDay[key].count += 1;
    }
    const trend = Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      return { date: key, total: roundMoney(byDay[key]?.total ?? 0), count: byDay[key]?.count ?? 0 };
    });

    const activity = [
      ...recentUsers.map((u) => ({ kind: 'user', at: u.createdAt, text: `${u.name} joined as ${u.role}` })),
      ...recentBookings.map((b) => ({
        kind: 'booking',
        at: b.createdAt,
        text: `${b.client?.name ?? 'A client'} booked "${b.gigTitle}" from ${b.freelancer?.name ?? 'a freelancer'} (${b.status})`,
      })),
      ...recentMessages.map((m) => ({ kind: 'message', at: m.createdAt, text: `${m.name} sent a message (${m.topic})` })),
    ]
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 10);

    res.status(200).json({
      success: true,
      data: {
        users: { total: users, freelancers, clients, admins, newThisWeek: newUsersThisWeek },
        gigs: {
          total: gigs,
          active: activeGigs,
          byCategory: Object.fromEntries(gigsByCategory.map((g) => [g._id, g.count])),
        },
        bookings: {
          total: bookings,
          byStatus: Object.fromEntries(bookingsByStatus.map((b) => [b._id, b.count])),
        },
        transactions: { count: transactionCount, volume: roundMoney(volume ? volume.total : 0), currency: 'ZAR', trend },
        messages: { new: newMessages },
        activity,
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/messages?status=new|read|resolved  (newest first, with a count per status for the tabs)
// GET /api/admin/messages?status=&search=  - search matches the sender's name, email, the message
// text itself, or a reference like "MSG-072FE2AA" (case-insensitive, and works with or without the
// "MSG-" prefix typed). Counts per status are always the true totals, unaffected by the search box,
// so the filter chips stay meaningful even while searching.
async function listMessages(req, res, next) {
  try {
    const filter = req.query.status ? { status: { $eq: String(req.query.status) } } : {};
    if (req.query.search) {
      const rx = containsRegex(String(req.query.search));
      filter.$or = [{ name: rx }, { email: rx }, { message: rx }, { reference: rx }];
    }
    const [messages, ...counts] = await Promise.all([
      ContactMessage.find(filter).sort({ createdAt: -1 }).limit(200).populate('user', 'name email role'),
      ...MESSAGE_STATUSES.map((status) => ContactMessage.countDocuments({ status })),
    ]);
    res.status(200).json({
      success: true,
      data: { messages, counts: Object.fromEntries(MESSAGE_STATUSES.map((s, i) => [s, counts[i]])) },
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/messages/:id/status  { status }
async function setMessageStatus(req, res, next) {
  try {
    const message = await ContactMessage.findById(req.params.id).populate('user', 'name email role');
    if (!message) return next(new AppError('Message not found.', 404));
    message.status = req.body.status;
    await message.save();
    res.status(200).json({ success: true, message: 'Message updated.', data: { message } });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/messages/:id/reply  { text }  - emails the sender and records the reply
async function replyToMessage(req, res, next) {
  try {
    const message = await ContactMessage.findById(req.params.id);
    if (!message) return next(new AppError('Message not found.', 404));

    const admin = await User.findById(req.user.id).select('name');
    const text = req.body.text;
    message.replies.push({ from: 'admin', text, admin: req.user.id, adminName: admin.name, sentAt: new Date() });
    if (message.status === 'new') message.status = 'read'; // a reply always implies at least "read"
    await message.save();

    // The reference lets the sender quote it if they write back, the same way the original send-off did.
    await sendMail({
      to: message.email,
      subject: `Re: your message to HustleHub+ (${message.reference})`,
      text: `${text}\n\n---\nYour original message:\n${message.message}`,
      html: replyEmailHtml({ replyText: text, originalMessage: message.message, reference: message.reference }),
    });

    // If the sender was logged in when they wrote in, they can also see the reply right in the app
    // (Contact page → "your messages"), not only by email - and if they're online right now, this
    // shows it to them live instead of only on their next visit.
    if (message.user) {
      emitToUser(message.user, 'contact-reply:new', { reference: message.reference });
    }

    const populated = await ContactMessage.findById(message.id).populate('user', 'name email role');
    res.status(201).json({ success: true, message: 'Reply sent.', data: { message: populated } });
  } catch (err) {
    next(err);
  }
}

// A field in a CSV row containing a comma, a quote or a newline has to be quoted, with any internal
// quote doubled - the one bit of CSV's own escaping this function exists to get right.
function csvField(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// GET /api/admin/report  - one row per user, decoded back to plain text (names/emails are stored
// HTML-escaped everywhere else in this app, which would show literally as "&amp;" in a spreadsheet),
// with what they've done on the platform: gigs listed, money earned or spent. Built by reading the
// three collections once each and joining them in memory rather than an aggregation pipeline - simpler
// to read and verify correct at this project's scale, where "small enough to hold in memory" always holds.
async function downloadReport(req, res, next) {
  try {
    const [users, gigs, transactions, bookings] = await Promise.all([
      User.find({}).sort({ createdAt: -1 }).lean(),
      Gig.find({}).lean(),
      Transaction.find({}).lean(),
      Booking.find({}).lean(),
    ]);

    const gigCountByFreelancer = new Map();
    const activeGigCountByFreelancer = new Map();
    gigs.forEach((g) => {
      const key = String(g.freelancer);
      gigCountByFreelancer.set(key, (gigCountByFreelancer.get(key) || 0) + 1);
      if (g.isActive) activeGigCountByFreelancer.set(key, (activeGigCountByFreelancer.get(key) || 0) + 1);
    });

    const earnedByFreelancer = new Map();
    const spentByClient = new Map();
    transactions.forEach((t) => {
      if (t.status === 'refunded') return; // money went back to the client: not earned, not spent
      const f = String(t.freelancer);
      const c = String(t.client);
      earnedByFreelancer.set(f, (earnedByFreelancer.get(f) || 0) + t.amount);
      spentByClient.set(c, (spentByClient.get(c) || 0) + t.amount);
    });

    const bookingsMadeByClient = new Map();
    const bookingsReceivedByFreelancer = new Map();
    const openIssuesByUser = new Map();
    bookings.forEach((b) => {
      const c = String(b.client);
      const f = String(b.freelancer);
      bookingsMadeByClient.set(c, (bookingsMadeByClient.get(c) || 0) + 1);
      bookingsReceivedByFreelancer.set(f, (bookingsReceivedByFreelancer.get(f) || 0) + 1);
      if (b.hasOpenIssue) {
        openIssuesByUser.set(c, (openIssuesByUser.get(c) || 0) + 1);
        openIssuesByUser.set(f, (openIssuesByUser.get(f) || 0) + 1);
      }
    });

    const header = [
      'Name', 'Email', 'Role', 'Status', 'Joined',
      'Active gigs', 'Total gigs listed',
      'Bookings made (as client)', 'Bookings received (as freelancer)',
      'Total spent (ZAR)', 'Total earned (ZAR)', 'Open issues',
    ];
    const rows = users.map((u) => {
      const id = String(u._id);
      return [
        validator.unescape(u.name),
        u.email,
        u.role,
        u.isActive ? 'Active' : 'Disabled',
        new Date(u.createdAt).toISOString().slice(0, 10),
        activeGigCountByFreelancer.get(id) || 0,
        gigCountByFreelancer.get(id) || 0,
        bookingsMadeByClient.get(id) || 0,
        bookingsReceivedByFreelancer.get(id) || 0,
        (spentByClient.get(id) || 0).toFixed(2),
        (earnedByFreelancer.get(id) || 0).toFixed(2),
        openIssuesByUser.get(id) || 0,
      ];
    });

    const csv = [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n');
    const filename = `hustlehub-report-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // A BOM so Excel (which otherwise guesses the wrong encoding for anything beyond plain ASCII) opens
    // this as UTF-8 rather than mangling a name with an accented character.
    res.status(200).send(`\uFEFF${csv}`);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listUsers,
  setUserStatus,
  listAllGigs,
  deleteAnyGig,
  listAllTransactions,
  listEscrow,
  listDisputes,
  resolveDispute,
  getStats,
  listMessages,
  setMessageStatus,
  replyToMessage,
  downloadReport,
};
