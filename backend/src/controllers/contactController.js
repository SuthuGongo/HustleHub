const ContactMessage = require('../models/ContactMessage');
const AppError = require('../utils/AppError');
const { emitToRole } = require('../services/socketService');

// POST /api/contact  (public; a valid token, if present, links the message to that account)
async function createMessage(req, res, next) {
  try {
    // Spam trap: the form has an invisible "website" field that people never fill in but bots do.
    // Pretend it worked (so bots learn nothing) and store nothing.
    if (typeof req.body.website === 'string' && req.body.website.trim() !== '') {
      return res.status(201).json({ success: true, message: 'Thank you. Your message has been sent to the team.', data: { reference: 'MSG-00000000' } });
    }

    const { name, email, topic, message } = req.body;
    const created = await ContactMessage.create({
      user: req.user ? req.user.id : null, // from the verified token, never from the request body
      name,
      email,
      topic: topic || 'general',
      message,
    });

    // Lets an admin who is looking at the console right now see it arrive, instead of only finding out
    // on their next visit to the Messages tab - the same live-push idea chat already uses.
    emitToRole('admin', 'contact:new', { reference: created.reference });

    res.status(201).json({
      success: true,
      message: 'Thank you. Your message has been sent to the team.',
      data: { reference: created.reference }, // nothing else is echoed back
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/contact/mine  (authenticated) - the signed-in person's own messages to the team, with any
// replies. Only messages actually linked to this account (via the verified token at send-time) - a
// message sent anonymously, even from the same person, was never tied to an account and cannot be
// claimed retroactively, which is a deliberate limitation: there is nothing safe to match it on.
async function listMine(req, res, next) {
  try {
    const messages = await ContactMessage.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(50);
    const data = messages.map((m) => {
      // "Unread" means specifically "the team said something back I haven't seen yet" - the sender's
      // own most recent follow-up should never make their own message look unread to themselves.
      const lastAdminReply = [...m.replies].reverse().find((r) => r.from !== 'sender');
      const unreadReply = Boolean(lastAdminReply) && (!m.repliesSeenAt || lastAdminReply.sentAt > m.repliesSeenAt);
      return { ...m.toJSON(), unreadReply };
    });
    res.status(200).json({ success: true, data: { messages: data } });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/contact/mine/seen  (authenticated) - marks every reply the person has received as seen,
// called when they open the "your messages" section, the same "opening it is what read means" pattern
// already used for chat conversations.
async function markMineSeen(req, res, next) {
  try {
    await ContactMessage.updateMany({ user: req.user.id }, { repliesSeenAt: new Date() });
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}

// POST /api/contact/mine/:id/reply  (authenticated, only the message's own sender) - follows up on a
// message that's already been replied to, e.g. because the team's answer didn't actually fix things.
// Reopens it (status back to 'new') so it lands in front of the team again rather than sitting quietly
// in "resolved", and pings admins live the same way a brand new message does - a reopened issue
// deserves the same visibility a fresh one gets, not a lower-priority silent update.
async function replyToMine(req, res, next) {
  try {
    const message = await ContactMessage.findOne({ _id: req.params.id, user: req.user.id });
    if (!message) return next(new AppError('Message not found.', 404)); // also covers someone else's message - 404, not 403
    const now = new Date();
    message.replies.push({ from: 'sender', text: req.body.text, sentAt: now });
    message.status = 'new';
    message.repliesSeenAt = now; // the sender is here right now; there's nothing of their own left to "catch up" on
    await message.save();
    emitToRole('admin', 'contact:new', { reference: message.reference });
    res.status(201).json({ success: true, data: { message } });
  } catch (err) {
    next(err);
  }
}

module.exports = { createMessage, listMine, markMineSeen, replyToMine };
