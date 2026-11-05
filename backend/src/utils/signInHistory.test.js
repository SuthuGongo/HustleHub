jest.mock('../models/SignIn', () => ({ create: jest.fn(), find: jest.fn(), deleteMany: jest.fn() }));

const SignIn = require('../models/SignIn');
const logger = require('./logger');
const { recordSignIn, listRecentSignIns } = require('./signInHistory');

const user = { _id: 'obj1', id: 'u1' };
const req = (ua) => ({ ip: '::1', get: () => ua });

const surplus = (rows) => ({ sort: () => ({ skip: () => ({ select: () => ({ lean: async () => rows }) }) }) });

beforeEach(() => {
  jest.clearAllMocks();
  SignIn.create.mockResolvedValue({});
  SignIn.find.mockReturnValue(surplus([]));
  jest.spyOn(logger, 'warn').mockImplementation(() => {});
});

test('a sign-in stores the address, the browser and how the person signed in', async () => {
  await recordSignIn(user, req('Mozilla/5.0 Chrome'), 'password');
  expect(SignIn.create).toHaveBeenCalledWith({ user: 'obj1', ip: '::1', userAgent: 'Mozilla/5.0 Chrome', method: 'password' });
});

test('rows beyond the newest 50 are deleted, and nothing is deleted when there are none', async () => {
  await recordSignIn(user, req('ua'), 'password');
  expect(SignIn.deleteMany).not.toHaveBeenCalled();
  SignIn.find.mockReturnValue(surplus([{ _id: 'old1' }, { _id: 'old2' }]));
  await recordSignIn(user, req('ua'), 'password');
  expect(SignIn.deleteMany).toHaveBeenCalledTimes(1);
});

test('an oversized browser string is cut and a missing one is stored as empty', async () => {
  await recordSignIn(user, req('x'.repeat(1000)), 'two_factor');
  expect(SignIn.create.mock.calls[0][0].userAgent).toHaveLength(300);
  await recordSignIn(user, { ip: undefined, get: () => undefined }, 'password');
  expect(SignIn.create.mock.calls[1][0]).toMatchObject({ ip: '', userAgent: '' });
});

test('a failure to record is logged and never thrown', async () => {
  SignIn.create.mockRejectedValue(new Error('db down'));
  await expect(recordSignIn(user, req('ua'), 'password')).resolves.toBeUndefined();
  expect(logger.warn).toHaveBeenCalledWith('security.sign_in_not_recorded', { userId: 'u1', error: 'db down' });
});

test('the list is newest first, limited, and shaped for the page', async () => {
  const lean = jest.fn().mockResolvedValue([{ _id: 'a', at: new Date(0), ip: '::1', userAgent: 'ua', method: 'password', extra: 'dropped' }]);
  const limit = jest.fn().mockReturnValue({ lean });
  const sort = jest.fn().mockReturnValue({ limit });
  SignIn.find.mockReturnValue({ sort });
  const rows = await listRecentSignIns('u1', 5);
  expect(SignIn.find).toHaveBeenCalledWith({ user: 'u1' });
  expect(sort).toHaveBeenCalledWith({ at: -1 });
  expect(limit).toHaveBeenCalledWith(5);
  expect(rows).toEqual([{ id: 'a', at: new Date(0), ip: '::1', userAgent: 'ua', method: 'password' }]);
});
