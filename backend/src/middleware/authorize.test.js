const authorize = require('./authorize');

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

  test('rejects a wrong role with 403', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const next = run({ id: '1', role: 'client' }, ['admin']);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  test('rejects a missing user with 401', () => {
    const next = run(undefined, ['admin']);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  test('a URL containing line breaks cannot forge extra log lines', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    run({ id: '1', role: 'client' }, ['admin'], '/api/x\n[SECURITY] fake entry\r\nmore');
    const line = warn.mock.calls[0][0];
    expect(line).not.toMatch(/[\r\n]/);
    expect(line).toContain('/api/x[SECURITY] fake entry');
  });
});
