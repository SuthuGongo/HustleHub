const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Gig = require('../models/Gig');
const AppError = require('../utils/AppError');
const { ROLES } = require('../utils/constants');
const { loadConversationForParticipant, sendMessage, markRead } = require('../services/chatService');

const PAGE_SIZE = 50;

// POST /api/conversations  (client only)  { gigId }
// Starts a conversation with that gig's freelancer, or returns the existing one for this (client,
// freelancer, gig) triple - "message the seller" always continues the same thread rather than
// splitting into a new one every time the button is clicked.
async function startConversation(req, res, next) {
  try {
    const { gigId } = req.body;
    if (!mongoose.isValidObjectId(gigId)) return next(new AppError('Gig not found.', 404));

    const gig = await Gig.findById(gigId).populate('freelancer', 'name');
    if (!gig || !gig.isActive) return next(new AppError('Gig not found.', 404));
    if (String(gig.freelancer.id) === req.user.id) {
      return next(new AppError('You cannot message yourself about your own gig.', 400));
    }

    const existing = await Conversation.findOne({ client: req.user.id, freelancer: gig.freelancer.id, gig: gig.id });
    if (existing) {
      return res.status(200).json({ success: true, data: { conversation: existing } });
    }

    const conversation = await Conversation.create({
      client: req.user.id,
      freelancer: gig.freelancer.id,
      gig: gig.id,
      gigTitle: gig.title,
    });
    res.status(201).json({ success: true, data: { conversation } });
  } catch (err) {
    // A race between two near-simultaneous "message the seller" clicks hits the unique index rather
    // than the findOne-first check above; treat that the same as finding it, not as an error.
    if (err.code === 11000) {
      try {
        const gig = await Gig.findById(req.body.gigId).select('freelancer');
        const existing = gig && (await Conversation.findOne({ client: req.user.id, freelancer: gig.freelancer, gig: gig.id }));
        if (existing) return res.status(200).json({ success: true, data: { conversation: existing } });
      } catch {
        /* fall through to the generic handler below */
      }
    }
    next(err);
  }
}

// GET /api/conversations  - the current user's own conversations, newest activity first, with how many
// messages are unread on their side (the plain byte-size list; full history is fetched per-conversation).
async function listConversations(req, res, next) {
  try {
    const isFreelancer = req.user.role === ROLES.FREELANCER;
    const filter = isFreelancer ? { freelancer: req.user.id } : { client: req.user.id };
    const conversations = await Conversation.find(filter)
      .sort({ lastMessageAt: -1 })
      .limit(100)
      .populate('client', 'name')
      .populate('freelancer', 'name');

    const data = conversations.map((c) => {
      const readAt = isFreelancer ? c.freelancerLastReadAt : c.clientLastReadAt;
      const unread = c.lastMessageAt > readAt && String(c.lastMessageSender) !== req.user.id;
      return { ...c.toJSON(), unread };
    });

    res.status(200).json({ success: true, data: { conversations: data } });
  } catch (err) {
    next(err);
  }
}

// GET /api/conversations/:id/messages?before=<ISO date>  - most recent PAGE_SIZE messages, oldest first,
// or the PAGE_SIZE before a given message's timestamp when scrolling further back.
async function listMessages(req, res, next) {
  try {
    const conversation = await loadConversationForParticipant(req.params.id, req.user.id);
    const filter = { conversation: conversation.id };
    if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };

    const page = await Message.find(filter).sort({ createdAt: -1 }).limit(PAGE_SIZE).populate('sender', 'name role');
    res.status(200).json({
      success: true,
      data: { conversation, messages: page.reverse(), hasMore: page.length === PAGE_SIZE },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/conversations/:id/messages  { text }  - the REST fallback for sending; the socket path
// (sockets/chatSocket.js) calls the exact same chatService.sendMessage under the hood.
async function postMessage(req, res, next) {
  try {
    const { message } = await sendMessage({ conversationId: req.params.id, senderId: req.user.id, text: req.body.text });
    res.status(201).json({ success: true, data: { message } });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/conversations/:id/read
async function markConversationRead(req, res, next) {
  try {
    const conversation = await markRead({ conversationId: req.params.id, userId: req.user.id });
    res.status(200).json({ success: true, data: { conversation } });
  } catch (err) {
    next(err);
  }
}

module.exports = { startConversation, listConversations, listMessages, postMessage, markConversationRead };
