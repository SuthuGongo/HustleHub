const mongoose = require('mongoose');
const cleanJson = require('../utils/toJSON');

// A conversation always has exactly two participants: the client and the freelancer. Only a client can
// start one (see conversationController.js) - a freelancer can reply, but never cold-message a client -
// which keeps the RBAC simple and avoids freelancers using chat as a spam channel.
const conversationSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // What the conversation is about, if it started from a gig page. Optional: nothing stops it being
    // kept even if the gig is later deleted or paused (the reference here does not need to resolve).
    gig: { type: mongoose.Schema.Types.ObjectId, ref: 'Gig', default: null },
    gigTitle: { type: String, default: '', trim: true, maxlength: 700 }, // snapshot, survives gig deletion

    // Denormalised for a cheap conversation-list query: avoids a second lookup per row just to show a preview.
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: { type: String, default: '', maxlength: 300 },
    lastMessageSender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // A message is "unread" for a side if it arrived after that side's own last-read timestamp - cheaper
    // and simpler than a per-message read receipt, and enough for a two-person conversation.
    clientLastReadAt: { type: Date, default: () => new Date(0) },
    freelancerLastReadAt: { type: Date, default: () => new Date(0) },
  },
  { timestamps: true }
);

// One conversation per (client, freelancer, gig) triple: reopening from the same gig page continues the
// existing thread instead of splitting into duplicates. A plain compound unique index, not a partial one:
// `gig` is always set by every path that creates a conversation today (see conversationController.js),
// so there is currently no gig-less case for a partial filter to matter for - and a plain index here also
// works on every MongoDB-compatible database, including ones (FerretDB, used in this project's own test
// environment) that do not yet implement partial indexes.
conversationSchema.index({ client: 1, freelancer: 1, gig: 1 }, { unique: true });

conversationSchema.plugin(cleanJson);

module.exports = mongoose.model('Conversation', conversationSchema);
