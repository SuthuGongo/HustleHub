const mongoose = require('mongoose');

// One row per successful sign-in, so a person can see where their account has been used and spot a
// sign-in that was not them. Only metadata is kept (when, from which address, which browser): never
// the password, a token or a code. Only the newest 50 per person are kept: recordSignIn() deletes older rows.
// There is no time-based expiry index, so the model works the same on any MongoDB-compatible database.
const signInSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    at: { type: Date, default: Date.now },
    ip: { type: String, default: '', maxlength: 64 },
    userAgent: { type: String, default: '', maxlength: 300 },
    method: { type: String, enum: ['password', 'email_verification', 'two_factor'], required: true },
  },
  { versionKey: false }
);

signInSchema.index({ user: 1, at: -1 });

module.exports = mongoose.model('SignIn', signInSchema);
