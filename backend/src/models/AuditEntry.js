const mongoose = require('mongoose');

// One link in the tamper-evident chain of money events (see services/auditTrail.js). Entries are only
// ever added: nothing in the application updates or deletes one. `hash` covers every other field plus the
// previous entry's hash, so changing or removing any entry breaks the chain from that point on.
const auditEntrySchema = new mongoose.Schema(
  {
    seq: { type: Number, required: true, unique: true }, // 1, 2, 3 ... with no gaps
    at: { type: Date, required: true },
    event: { type: String, required: true, maxlength: 60 },
    bookingId: { type: String, default: '', maxlength: 40 },
    actorId: { type: String, default: '', maxlength: 40 }, // who did it (the user or the admin)
    amount: { type: Number, default: null },
    note: { type: String, default: '', maxlength: 120 },
    prevHash: { type: String, required: true, maxlength: 64 },
    hash: { type: String, required: true, maxlength: 64 },
  },
  { versionKey: false }
);

module.exports = mongoose.model('AuditEntry', auditEntrySchema);
