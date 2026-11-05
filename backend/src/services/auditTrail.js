const crypto = require('crypto');
const AuditEntry = require('../models/AuditEntry');
const logger = require('../utils/logger');

// A tamper-evident record of every money event: a booking paid for, work completed, funds released,
// a dispute raised, a dispute settled. Each entry stores the SHA-256 hash of the entry before it, like
// a very small blockchain. Editing an entry changes its hash, deleting one leaves a gap, and either
// way the next entry no longer matches, so verifyChain() can say exactly where the records stopped
// being trustworthy. It answers "has anyone changed the financial history behind the application's back?".
//
// What it cannot detect on its own is the newest entries being deleted (nothing comes after them to
// disagree). Each new entry's number and hash is therefore also written to the structured log, which
// is shipped to Better Stack, so the latest hash is held somewhere the database owner cannot edit.

const GENESIS_HASH = '0'.repeat(64);
const MAX_RETRIES = 8;

function hashEntry(entry) {
  const body = JSON.stringify([
    entry.seq,
    new Date(entry.at).toISOString(),
    entry.event,
    entry.bookingId || '',
    entry.actorId || '',
    entry.amount === null || entry.amount === undefined ? null : Number(entry.amount),
    entry.note || '',
    entry.prevHash,
  ]);
  return crypto.createHash('sha256').update(body).digest('hex');
}

// Adds one entry to the end of the chain. Two requests can try to take the same number at the same
// moment; the unique index on `seq` lets only one succeed and the other simply tries again with the
// next number. Never throws: a problem with the audit trail is logged loudly but must not undo a payment.
async function append(event, { bookingId, actorId, amount, note } = {}) {
  try {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const last = await AuditEntry.findOne().sort({ seq: -1 }).lean();
      const entry = {
        seq: last ? last.seq + 1 : 1,
        at: new Date(),
        event,
        bookingId: bookingId ? String(bookingId) : '',
        actorId: actorId ? String(actorId) : '',
        amount: amount === undefined || amount === null ? null : Number(amount),
        note: note ? String(note).slice(0, 120) : '',
        prevHash: last ? last.hash : GENESIS_HASH,
      };
      entry.hash = hashEntry(entry);
      try {
        await AuditEntry.create(entry);
        // Logged as `fingerprint`, not `hash`: the logger blanks any field whose name contains "hash".
        logger.info('audit.entry_written', { seq: entry.seq, auditEvent: event, fingerprint: entry.hash });
        return entry;
      } catch (err) {
        if (err && err.code === 11000) continue; // someone else took this number first
        throw err;
      }
    }
    throw new Error('could not take the next audit number');
  } catch (err) {
    logger.error('audit.write_failed', { auditEvent: event, bookingId, error: err });
    return null;
  }
}

// Reads the whole chain from the start and recomputes every hash. Stops at the first problem.
async function verifyChain() {
  let expectedSeq = 1;
  let expectedPrev = GENESIS_HASH;
  let checked = 0;
  const cursor = AuditEntry.find().sort({ seq: 1 }).lean().cursor();
  for await (const entry of cursor) {
    const broken = (reason) => ({ ok: false, checked, brokenAtSeq: entry.seq, reason });
    if (entry.seq !== expectedSeq) return broken(`entry ${expectedSeq} is missing`);
    if (entry.prevHash !== expectedPrev) return broken('it no longer follows the entry before it');
    if (hashEntry(entry) !== entry.hash) return broken('its contents were changed after it was written');
    expectedSeq += 1;
    expectedPrev = entry.hash;
    checked += 1;
  }
  return { ok: true, checked, headHash: checked ? expectedPrev : null };
}

async function listRecent(limit = 50) {
  const rows = await AuditEntry.find().sort({ seq: -1 }).limit(limit).lean();
  return rows.map((r) => ({
    seq: r.seq, at: r.at, event: r.event, bookingId: r.bookingId, actorId: r.actorId,
    amount: r.amount, note: r.note, hash: r.hash, prevHash: r.prevHash,
  }));
}

module.exports = { GENESIS_HASH, hashEntry, append, verifyChain, listRecent };
