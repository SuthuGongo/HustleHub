// An in-memory stand-in for the AuditEntry collection, with the same unique-number rule as the real index.
let mockRows;
let mockFail = false;
jest.mock('../models/AuditEntry', () => ({
  findOne: () => {
    if (mockFail) throw new Error('db down');
    return { sort: () => ({ lean: async () => (mockRows.length ? { ...mockRows[mockRows.length - 1] } : null) }) };
  },
  create: async (entry) => {
    if (mockRows.some((r) => r.seq === entry.seq)) throw Object.assign(new Error('duplicate'), { code: 11000 });
    mockRows.push({ ...entry });
    return entry;
  },
  find: () => ({
    sort: (order) => ({
      limit: (n) => ({ lean: async () => [...mockRows].sort((a, b) => (order.seq === 1 ? a.seq - b.seq : b.seq - a.seq)).slice(0, n) }),
      lean: () => ({ cursor: () => (async function* () { for (const r of [...mockRows].sort((a, b) => a.seq - b.seq)) yield { ...r }; })() }),
    }),
  }),
}));

const logger = require('../utils/logger');
const audit = require('./auditTrail');

beforeEach(() => {
  mockRows = [];
  mockFail = false;
  jest.spyOn(logger, 'info').mockImplementation(() => {});
  jest.spyOn(logger, 'error').mockImplementation(() => {});
});

async function threeEntries() {
  await audit.append('booking.paid', { bookingId: 'b1', actorId: 'c1', amount: 450.5, note: 'held in escrow' });
  await audit.append('booking.completed', { bookingId: 'b1', actorId: 'f1', amount: 450.5 });
  await audit.append('funds.released', { bookingId: 'b1', actorId: 'c1', amount: 450.5 });
}

test('entries are numbered from 1 and each one stores the hash of the one before it', async () => {
  await threeEntries();
  expect(mockRows.map((r) => r.seq)).toEqual([1, 2, 3]);
  expect(mockRows[0].prevHash).toBe(audit.GENESIS_HASH);
  expect(mockRows[1].prevHash).toBe(mockRows[0].hash);
  expect(mockRows[2].prevHash).toBe(mockRows[1].hash);
  expect(mockRows[0].hash).toMatch(/^[0-9a-f]{64}$/);
  expect(logger.info).toHaveBeenCalledWith('audit.entry_written', expect.objectContaining({ seq: 3, fingerprint: mockRows[2].hash }));
});

test('an intact chain verifies, and an empty one does too', async () => {
  expect(await audit.verifyChain()).toEqual({ ok: true, checked: 0, headHash: null });
  await threeEntries();
  expect(await audit.verifyChain()).toEqual({ ok: true, checked: 3, headHash: mockRows[2].hash });
});

test('changing an amount after the fact is detected at that entry', async () => {
  await threeEntries();
  mockRows[1].amount = 1;
  expect(await audit.verifyChain()).toMatchObject({ ok: false, checked: 1, brokenAtSeq: 2, reason: expect.stringMatching(/changed/) });
});

test('deleting an entry from the middle is detected', async () => {
  await threeEntries();
  mockRows.splice(1, 1);
  expect(await audit.verifyChain()).toMatchObject({ ok: false, brokenAtSeq: 3, reason: expect.stringMatching(/entry 2 is missing/) });
});

test('rewriting an entry and its own hash still fails, because the next entry no longer follows it', async () => {
  await threeEntries();
  mockRows[0].amount = 5;
  mockRows[0].hash = audit.hashEntry(mockRows[0]);
  expect(await audit.verifyChain()).toMatchObject({ ok: false, brokenAtSeq: 2, reason: expect.stringMatching(/no longer follows/) });
});

test('two writers racing for the same number both succeed, one after the other', async () => {
  await Promise.all([audit.append('booking.paid', { bookingId: 'a' }), audit.append('booking.paid', { bookingId: 'b' })]);
  expect(mockRows.map((r) => r.seq)).toEqual([1, 2]);
  expect((await audit.verifyChain()).ok).toBe(true);
});

test('a failure to write is logged and never thrown', async () => {
  mockFail = true;
  await expect(audit.append('booking.paid', { bookingId: 'b1' })).resolves.toBeNull();
  expect(logger.error).toHaveBeenCalledWith('audit.write_failed', expect.objectContaining({ auditEvent: 'booking.paid' }));
});

test('the newest entries come back first, without anything extra', async () => {
  await threeEntries();
  const list = await audit.listRecent(2);
  expect(list.map((e) => e.seq)).toEqual([3, 2]);
  expect(Object.keys(list[0]).sort()).toEqual(['amount', 'actorId', 'at', 'bookingId', 'event', 'hash', 'note', 'prevHash', 'seq'].sort());
});
