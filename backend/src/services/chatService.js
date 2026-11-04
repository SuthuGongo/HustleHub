const validator = require('validator');
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const AppError = require('../utils/AppError');
const { emitToUser } = require('./socketService');

const MESSAGE_MAX_LENGTH = 4000;
const PREVIEW_LENGTH = 140;

// Same escaping as every other free-text field in the app (see resourceValidators.js) - called directly
// here, rather than through an express-validator chain, because a message sent over the socket never
// passes through Express middleware at all. Using the exact same underlying function (`validator.escape`,
// which express-validator's `.escape()` itself calls) keeps the two transports byte-for-byte consistent.
function cleanText(raw) {
  if (typeof raw !== 'string') throw new AppError('Message must be text.', 422);
  const trimmed = raw.trim();
  if (!trimmed) throw new AppError('Message cannot be empty.', 422);
  if (trimmed.length > MESSAGE_MAX_LENGTH) throw new AppError(`Message must be ${MESSAGE_MAX_LENGTH} characters or fewer.`, 422);
  return validator.escape(trimmed);
}

function role(conversation, userId) {
  if (String(conversation.client) === String(userId)) return 'client';
  if (String(conversation.freelancer) === String(userId)) return 'freelancer';
  return null;
}

// Both participants, or neither - never a partial view of who is allowed in.
async function loadConversationForParticipant(conversationId, userId) {
  if (!mongoose.isValidObjectId(conversationId)) throw new AppError('Conversation not found.', 404);
  const conversation = await Conversation.findById(conversationId);
  // 404, not 403, for someone else's conversation: this ID space should not be probeable any more than
  // a booking id is (see bookingController.js for the same reasoning).
  if (!conversation || !role(conversation, userId)) throw new AppError('Conversation not found.', 404);
  return conversation;
}

// Reused by startConversation (client picking "Message the seller") and, separately, by a booking
// dispute (see bookingController.disputeEscrow), which needs the same client/freelancer/gig thread to
// drop a system notice into even if the client never visited the gig page to open one themselves.
async function findOrCreateConversation({ client, freelancer, gig, gigTitle }) {
  const existing = await Conversation.findOne({ client, freelancer, gig });
  if (existing) return existing;
  try {
    return await Conversation.create({ client, freelancer, gig, gigTitle });
  } catch (err) {
    // Same race startConversation itself guards against: treat "someone else just created it" as success.
    if (err.code === 11000) {
      const again = await Conversation.findOne({ client, freelancer, gig });
      if (again) return again;
    }
    throw err;
  }
}

// The one place a message is ever actually stored, whichever transport or caller asked for it: stores
// the already-cleaned text, updates the conversation's preview/unread bookkeeping, and pushes it live to
// the OTHER participant over their socket (the sender already has their own optimistic copy on REST, or
// gets the ack directly on the socket path - either way this only needs to reach the other side).
async function storeMessage({ conversation, senderId, clean }) {
  const message = await Message.create({ conversation: conversation.id, sender: senderId, text: clean });

  conversation.lastMessageAt = message.createdAt;
  conversation.lastMessagePreview = clean.length > PREVIEW_LENGTH ? `${clean.slice(0, PREVIEW_LENGTH)}…` : clean;
  conversation.lastMessageSender = senderId;
  // Sending a message always counts as having read up to that point yourself.
  if (role(conversation, senderId) === 'client') conversation.clientLastReadAt = message.createdAt;
  else conversation.freelancerLastReadAt = message.createdAt;
  await conversation.save();

  const recipientId = role(conversation, senderId) === 'client' ? conversation.freelancer : conversation.client;
  emitToUser(recipientId, 'message:new', { conversationId: conversation.id, message: message.toJSON() });
  emitToUser(recipientId, 'conversation:updated', { conversationId: conversation.id });

  return { conversation, message };
}

// Ordinary user-typed chat: text arrives raw (REST body or socket payload) and must be escaped here.
async function sendMessage({ conversationId, senderId, text }) {
  const conversation = await loadConversationForParticipant(conversationId, senderId);
  return storeMessage({ conversation, senderId, clean: cleanText(text) });
}

// An automated notice assembled server-side (e.g. a dispute reason, which express-validator's
// `.escape()` already cleaned once in resourceValidators.js) - never re-escapes text that is already
// safe, which would otherwise turn e.g. a literal "&" the client typed into "&amp;amp;" on screen.
async function postPreparedMessage({ conversationId, senderId, text }) {
  const conversation = await loadConversationForParticipant(conversationId, senderId);
  const clean = typeof text === 'string' ? text.trim().slice(0, MESSAGE_MAX_LENGTH) : '';
  if (!clean) throw new AppError('Message cannot be empty.', 422);
  return storeMessage({ conversation, senderId, clean });
}

async function markRead({ conversationId, userId }) {
  const conversation = await loadConversationForParticipant(conversationId, userId);
  const now = new Date();
  if (role(conversation, userId) === 'client') conversation.clientLastReadAt = now;
  else conversation.freelancerLastReadAt = now;
  await conversation.save();
  return conversation;
}

module.exports = {
  cleanText,
  role,
  loadConversationForParticipant,
  findOrCreateConversation,
  sendMessage,
  postPreparedMessage,
  markRead,
  MESSAGE_MAX_LENGTH,
};
