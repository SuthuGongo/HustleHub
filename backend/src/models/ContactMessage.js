const crypto = require('crypto');
const mongoose = require('mongoose');
const cleanJson = require('../utils/toJSON');
const { CONTACT_TOPICS, MESSAGE_STATUSES } = require('../utils/constants');

// A message someone sent to the team from the Contact page. Visitors do not need an account; if they were
// logged in, the account is linked (taken from their verified token, never from the request body).
const contactMessageSchema = new mongoose.Schema(
  {
    reference: { type: String, unique: true, default: () => `MSG-${crypto.randomBytes(4).toString('hex').toUpperCase()}` },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, required: true, trim: true, maxlength: 400 }, // stored HTML-escaped
    email: { type: String, required: true, trim: true, maxlength: 254 },
    topic: { type: String, enum: CONTACT_TOPICS, default: 'general' },
    message: { type: String, required: true, trim: true, maxlength: 12000 }, // stored HTML-escaped
    status: { type: String, enum: MESSAGE_STATUSES, default: 'new', index: true },
    // When the sender (if logged in) last looked at their own replies - lets the "you have a reply"
    // badge clear itself once they actually see it, the same idea as a conversation's read timestamp.
    repliesSeenAt: { type: Date, default: null },
    // Replies sent from the admin console: emailed to the sender, and kept here as the record of what
    // was actually said, in order. The admin's own account is referenced (never just a free-text name),
    // so the record can't be forged to look like it came from someone who never sent it.
    //
    // The sender can also follow up on their own message, once they're able to see a reply and the
    // issue still isn't resolved - those land in this same array too (`from: 'sender'`), so the whole
    // back-and-forth renders as one continuous thread, in order, whichever side sent which part.
    // `from` defaults to 'admin' so every entry created before this field existed is still valid data.
    replies: {
      type: [
        {
          from: { type: String, enum: ['admin', 'sender'], default: 'admin' },
          text: { type: String, required: true, trim: true, maxlength: 8000 }, // stored HTML-escaped
          admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // set only when from === 'admin'
          adminName: { type: String, default: '' }, // snapshot: still shows who replied if the admin account is later removed
          sentAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

contactMessageSchema.plugin(cleanJson);

module.exports = mongoose.model('ContactMessage', contactMessageSchema);
