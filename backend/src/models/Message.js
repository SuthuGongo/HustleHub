const mongoose = require('mongoose');
const cleanJson = require('../utils/toJSON');

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 4000 }, // stored HTML-escaped
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: 1 });

messageSchema.plugin(cleanJson);

module.exports = mongoose.model('Message', messageSchema);
