import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request, setUnauthorizedHandler } from '../api/client';
import { tokenStore } from '../utils/tokenStore';

const jsonResponse = (status, body) => ({ ok: status < 400, status, json: async () => body });

describe('api client', () => {
  beforeEach(() => {
    tokenStore.clear();
    setUnauthorizedHandler(null);
  });

  it('sends the JWT as a Bearer token and a JSON body', async () => {
    tokenStore.set('abc.def.ghi');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await request('/gigs', { method: 'POST', body: { title: 'x' } });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/gigs');
    expect(options.headers.Authorization).toBe('Bearer abc.def.ghi');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.body).toBe('{"title":"x"}');
  });

  it('does not send an Authorization header when logged out', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    await request('/health');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('surfaces only the API\'s message on errors, plus retry information', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(429, { message: 'Too many booking requests.', retryAfterSeconds: 120, stack: 'secret' })));
    await expect(request('/bookings', { method: 'POST', body: {} })).rejects.toMatchObject({
      name: 'ApiError',
      status: 429,
      message: 'Too many booking requests.',
      retryAfterSeconds: 120,
    });
  });

  it('falls back to a generic message when the body is not JSON (e.g. a proxy error page)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error('not json'); } }));
    await expect(request('/gigs')).rejects.toThrow('Something went wrong. Please try again.');
  });

  it('reports network failures in plain language', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = await request('/gigs').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toMatch(/Cannot reach the server/);
  });

  it('logs the user out when a request that carried a token gets a 401', async () => {
    tokenStore.set('expired.token.value');
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { message: 'Invalid or expired token.' })));
    await expect(request('/users/me')).rejects.toThrow();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does NOT trigger logout for a failed login (no token was sent)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { message: 'Invalid email or password.' })));
    await expect(request('/auth/login', { method: 'POST', body: {} })).rejects.toThrow('Invalid email or password.');
    expect(handler).not.toHaveBeenCalled();
  });
});
