import { tokenStore } from '../utils/tokenStore';

const BASE_URL = import.meta.env?.VITE_API_BASE_URL || '/api';
export { BASE_URL };

export class ApiError extends Error {
  constructor(message, status = 0, retryAfterSeconds = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

let onUnauthorized = null;
// AuthContext registers a callback so an expired/invalid token logs the person out everywhere.
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

export async function request(path, { method = 'GET', body, signal } = {}) {
  const token = tokenStore.get();
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    /* non-JSON body (e.g. a proxy error page) - never shown to the user */
  }

  if (!response.ok) {
    // A 401 on a request that carried a token means the session is no longer valid.
    if (response.status === 401 && token && onUnauthorized) onUnauthorized();
    // Only the API's own controlled "message" is ever displayed - never raw response bodies.
    const message = typeof data?.message === 'string' ? data.message : FALLBACK_MESSAGE;
    throw new ApiError(message, response.status, data?.retryAfterSeconds ?? null);
  }

  return data;
}
