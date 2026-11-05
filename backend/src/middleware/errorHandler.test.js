const { errorHandler, notFoundHandler } = require('./errorHandler');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

const makeRes = () => {
  const res = { headersSent: false };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const req = { method: 'POST', originalUrl: '/api/bookings?x=1', id: 'req-1', user: { id: 'u1' } };

describe('errorHandler', () => {
  afterEach(() => jest.restoreAllMocks());

  test('an unexpected error is logged in full, but the client only sees a generic message', () => {
    const error = jest.spyOn(logger, 'error').mockImplementation(() => {});
    const res = makeRes();
    errorHandler(new Error('database exploded: secret connection detail'), req, res, jest.fn());
    expect(error).toHaveBeenCalledWith(
      'error.unexpected',
      expect.objectContaining({ method: 'POST', path: '/api/bookings', userId: 'u1', requestId: 'req-1' })
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('secret connection detail');
  });

  test('a known low-level error is logged as handled and translated to a safe response', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const res = makeRes();
    const err = Object.assign(new Error('Cast to ObjectId failed'), { name: 'CastError', path: '_id', value: 'abc' });
    errorHandler(err, req, res, jest.fn());
    expect(warn).toHaveBeenCalledWith('error.handled', expect.objectContaining({ errorName: 'CastError', status: 400, field: '_id' }));
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('our own deliberate errors are returned as they are and not logged as bugs', () => {
    const error = jest.spyOn(logger, 'error').mockImplementation(() => {});
    const res = makeRes();
    errorHandler(new AppError('Gig not found.', 404), req, res, jest.fn());
    expect(error).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('hands over to the default handler when the response has already started', () => {
    const next = jest.fn();
    const err = new Error('late');
    errorHandler(err, req, { headersSent: true }, next);
    expect(next).toHaveBeenCalledWith(err);
  });

  test('unknown routes get a 404 message', () => {
    const res = makeRes();
    notFoundHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
