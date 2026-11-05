jest.mock('../models/User', () => ({ findById: jest.fn(), updateOne: jest.fn().mockResolvedValue({}) }));

const User = require('../models/User');
const logger = require('./logger');
const lockout = require('./accountLockout');
const { security } = require('../config/env');

const user = { _id: 'u1', id: 'u1' };
const afterIncrement = (count) =>
  User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ failedLoginCount: count }) });

beforeEach(() => { jest.clearAllMocks(); jest.spyOn(logger, 'warn').mockImplementation(() => {}); });

test('an account is locked only while lockUntil is in the future', () => {
  const now = Date.now();
  expect(lockout.isLocked({ lockUntil: new Date(now + 60000) }, now)).toBe(true);
  expect(lockout.isLocked({ lockUntil: new Date(now - 1) }, now)).toBe(false);
  expect(lockout.isLocked({ lockUntil: null }, now)).toBe(false);
  expect(lockout.isLocked(null)).toBe(false);
});

test('the wait is rounded up to whole minutes and is never below one', () => {
  const now = Date.now();
  expect(lockout.minutesLeft({ lockUntil: new Date(now + 61000) }, now)).toBe(2);
  expect(lockout.minutesLeft({ lockUntil: new Date(now + 1000) }, now)).toBe(1);
});

test('failures below the limit only count up, with one atomic increment', async () => {
  afterIncrement(security.lockoutMaxAttempts - 1);
  expect(await lockout.registerFailure(user)).toBe(false);
  expect(User.updateOne).toHaveBeenCalledTimes(1);
  expect(User.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $inc: { failedLoginCount: 1 } });
});

test('the failure that reaches the limit locks the account, resets the counter and is logged', async () => {
  afterIncrement(security.lockoutMaxAttempts);
  expect(await lockout.registerFailure(user, { ip: '::1', requestId: 'r1' })).toBe(true);
  const [filter, update] = User.updateOne.mock.calls[1];
  expect(filter).toEqual({ _id: 'u1' });
  expect(update.$set.failedLoginCount).toBe(0);
  expect(update.$set.lockUntil.getTime()).toBeGreaterThan(Date.now() + (security.lockoutMinutes - 1) * 60000);
  expect(logger.warn).toHaveBeenCalledWith('security.account_locked', expect.objectContaining({ userId: 'u1', ip: '::1', requestId: 'r1' }));
});

test('an account that no longer exists is not locked', async () => {
  User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
  expect(await lockout.registerFailure(user)).toBe(false);
});

test('clearing removes the count and the lock', async () => {
  await lockout.clearFailures(user);
  expect(User.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $set: { failedLoginCount: 0, lockUntil: null } });
});
