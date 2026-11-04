// Regression tests for: "when an admin refunds the client, the freelancer's income overview did not
// go down". The models are mocked, so these check the controller logic itself (what it asks the
// database to do) without needing a running MongoDB.
jest.mock('../../models/Booking');
jest.mock('../../models/Transaction');
jest.mock('../../models/User');
jest.mock('../../models/Gig');
jest.mock('../../models/ContactMessage');
jest.mock('../../utils/mailer', () => ({ sendMail: jest.fn() }));
jest.mock('../../services/socketService', () => ({ emitToUser: jest.fn() }));

const mongoose = require('mongoose');
const Booking = require('../../models/Booking');
const Transaction = require('../../models/Transaction');
const { resolveDispute } = require('../adminController');
const { getIncomeSummary } = require('../transactionController');

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

function mockDisputedBooking() {
  const booking = {
    _id: new mongoose.Types.ObjectId(),
    id: 'booking-1',
    escrowStatus: 'disputed',
    save: jest.fn().mockResolvedValue(),
  };
  Booking.findById = jest.fn().mockImplementation(() => {
    const q = Promise.resolve(booking);
    q.populate = jest.fn().mockReturnValue(q);
    return Object.assign(q, { populate: () => Object.assign(Promise.resolve(booking), { populate: () => Object.assign(Promise.resolve(booking), { populate: () => Promise.resolve(booking) }) }) });
  });
  return booking;
}

describe('resolveDispute', () => {
  beforeEach(() => jest.clearAllMocks());

  test('a refund marks the payment record refunded so it stops counting as income', async () => {
    const booking = mockDisputedBooking();
    Transaction.updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const res = makeRes();
    const next = jest.fn();

    await resolveDispute({ params: { id: 'booking-1' }, body: { resolution: 'refunded' }, user: { id: 'admin-1' } }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(booking.escrowStatus).toBe('refunded');
    expect(Transaction.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = Transaction.updateOne.mock.calls[0];
    expect(filter).toEqual({ booking: booking._id });
    expect(update.$set.status).toBe('refunded');
    expect(update.$set.refundedAt).toBeInstanceOf(Date);
  });

  test('releasing the funds to the freelancer leaves the payment record alone', async () => {
    mockDisputedBooking();
    Transaction.updateOne = jest.fn();
    const res = makeRes();

    await resolveDispute({ params: { id: 'booking-1' }, body: { resolution: 'released' }, user: { id: 'admin-1' } }, res, jest.fn());

    expect(Transaction.updateOne).not.toHaveBeenCalled();
  });
});

describe('getIncomeSummary', () => {
  beforeEach(() => jest.clearAllMocks());

  test('only counts completed payments as earned, and reports refunded money separately', async () => {
    const pipelines = [];
    Transaction.aggregate = jest.fn().mockImplementation(async (pipeline) => {
      pipelines.push(pipeline);
      const status = pipeline[0].$match.status;
      if (status === 'refunded') return [{ _id: null, total: 450 }];
      return [{ _id: null, totalEarned: 2200, total: 2200 }];
    });
    Transaction.countDocuments = jest.fn().mockImplementation(async (filter) => (filter.status === 'refunded' ? 1 : 2));
    const taxYearRows = [{ amount: 1500, createdAt: new Date() }, { amount: 700, createdAt: new Date() }];
    Transaction.find = jest.fn().mockImplementation((filter) =>
      filter.status === 'completed'
        ? { select: () => ({ lean: () => Promise.resolve(taxYearRows) }) } // tax-year earnings, month by month
        : { sort: () => ({ limit: () => ({ populate: () => Promise.resolve([]) }) }) } // recent payments list
    );
    const res = makeRes();

    await getIncomeSummary({ user: { id: new mongoose.Types.ObjectId().toString() } }, res, jest.fn());

    const body = res.json.mock.calls[0][0].data;
    expect(body.totalEarned).toBe(2200);
    expect(body.transactionCount).toBe(2);
    expect(body.averagePerBooking).toBe(1100);
    expect(body.refundedTotal).toBe(450);
    expect(body.refundedCount).toBe(1);
    // every earned/tax figure is built from "completed" payments only
    const earnedStatuses = pipelines.map((p) => p[0].$match.status);
    expect(earnedStatuses).toEqual(expect.arrayContaining(['completed', 'refunded']));
    expect(Transaction.countDocuments.mock.calls[0][0].status).toBe('completed');
    expect(body.tax.taxYearEarnings).toBe(2200);
  });
});
