const authorize = require('./authorize');
const logger = require('../utils/logger');

describe('authorize', () => {
  afterEach(() => jest.restoreAllMocks());

  const run = (user, roles, url = '/api/admin/users') => {
    const next = jest.fn();
    authorize(...roles)({ user, method: 'GET', originalUrl: url }, {}, next);
    return next;
  };

  test('lets an allowed role through', () => {
    const next = run({ id: '1', role: 'admin' }, ['admin']);
    expect(next).toHaveBeenCalledWith();
  });

  test('rejects a wrong role with 403 and records the attempt', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const next = run({ id: '1', role: 'client' }, ['admin']);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
    expect(warn).toHaveBeenCalledWith(
      'security.access_denied',
      expect.objectContaining({ userId: '1', role: 'client', method: 'GET', path: '/api/admin/users' })
    );
  });

  test('rejects a missing user with 401', () => {
    const next = run(undefined, ['admin']);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });
});
