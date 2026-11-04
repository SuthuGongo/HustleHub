import { request, ApiError, BASE_URL } from './client';
import { tokenStore } from '../utils/tokenStore';

const toQuery = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : '';
};

// ---- auth ----
export const register = (payload) => request('/auth/register', { method: 'POST', body: payload });
export const login = (payload) => request('/auth/login', { method: 'POST', body: payload });
export const getMe = () => request('/users/me');

// ---- email verification (finishing registration) ----
export const verifyEmail = (verifyToken, code) => request('/auth/verify-email', { method: 'POST', body: { verifyToken, code } });
export const resendEmailVerification = (verifyToken) => request('/auth/verify-email/resend', { method: 'POST', body: { verifyToken } });

// ---- forgot / reset password ----
export const forgotPassword = (email) => request('/auth/forgot-password', { method: 'POST', body: { email } });
export const resetPassword = (payload) => request('/auth/reset-password', { method: 'POST', body: payload });

// ---- two-factor authentication ----
export const twoFactorStatus = () => request('/auth/2fa/status');
export const requestEnableTwoFactor = () => request('/auth/2fa/enable/request', { method: 'POST' });
export const confirmEnableTwoFactor = (code) => request('/auth/2fa/enable/confirm', { method: 'POST', body: { code } });
export const disableTwoFactor = (password) => request('/auth/2fa/disable', { method: 'POST', body: { password } });
export const verifyTwoFactorLogin = (twoFactorToken, payload) =>
  request('/auth/2fa/verify', { method: 'POST', body: { twoFactorToken, ...payload } });
export const resendTwoFactorCode = (twoFactorToken) => request('/auth/2fa/resend', { method: 'POST', body: { twoFactorToken } });

// ---- gigs ----
export const listGigs = (params) => request(`/gigs${toQuery(params)}`);
export const getGig = (id) => request(`/gigs/${id}`);
export const listGigReviews = (id) => request(`/gigs/${id}/reviews`);
export const getCategoryCounts = () => request('/gigs/categories');
export const listMyGigs = () => request('/gigs/mine');
export const createGig = (payload) => request('/gigs', { method: 'POST', body: payload });
export const updateGig = (id, payload) => request(`/gigs/${id}`, { method: 'PATCH', body: payload });
export const deleteGig = (id) => request(`/gigs/${id}`, { method: 'DELETE' });

// ---- bookings & money ----
export const createBooking = (payload) => request('/bookings', { method: 'POST', body: payload });
export const listBookings = () => request('/bookings');
export const completeBooking = (id) => request(`/bookings/${id}/complete`, { method: 'PATCH' });
export const releaseBookingFunds = (id) => request(`/bookings/${id}/release`, { method: 'POST' });
export const disputeBooking = (id, reason) => request(`/bookings/${id}/dispute`, { method: 'POST', body: { reason } });
export const reviewBooking = (id, payload) => request(`/bookings/${id}/review`, { method: 'POST', body: payload });
export const setBookingIssue = (id, hasOpenIssue) => request(`/bookings/${id}/issue`, { method: 'PATCH', body: { hasOpenIssue } });
export const listTransactions = () => request('/transactions');
export const getIncome = () => request('/transactions/income');

// ---- contact the team (public) ----
export const sendContactMessage = (payload) => request('/contact', { method: 'POST', body: payload });
export const contactMine = () => request('/contact/mine');
export const markContactMineSeen = () => request('/contact/mine/seen', { method: 'PATCH' });
export const replyToOwnMessage = (id, text) => request(`/contact/mine/${id}/reply`, { method: 'POST', body: { text } });

// ---- admin ----
export const adminStats = () => request('/admin/stats');
export const adminUsers = () => request('/admin/users');
export const adminSetUserStatus = (id, isActive) =>
  request(`/admin/users/${id}/status`, { method: 'PATCH', body: { isActive } });
export const adminGigs = () => request('/admin/gigs');
export const adminDeleteGig = (id) => request(`/admin/gigs/${id}`, { method: 'DELETE' });
export const adminTransactions = () => request('/admin/transactions');
export const adminEscrow = () => request('/admin/escrow');
export const adminDisputes = () => request('/admin/disputes');
export const adminResolveDispute = (id, resolution) => request(`/admin/disputes/${id}/resolve`, { method: 'POST', body: { resolution } });
export const adminMessages = (status) => request(`/admin/messages${status ? `?status=${status}` : ''}`);
export const adminSetMessageStatus = (id, status) => request(`/admin/messages/${id}/status`, { method: 'PATCH', body: { status } });
export const adminReplyToMessage = (id, text) => request(`/admin/messages/${id}/reply`, { method: 'POST', body: { text } });

// A CSV file, not JSON, so this bypasses request()'s JSON-only handling and does its own fetch -
// still carrying the Bearer token the same way every other call does, since a plain <a href> download
// link has no way to attach an Authorization header. Triggers a real browser "Save As" by creating a
// short-lived object URL and clicking a throwaway link, then cleans both up immediately after.
export async function downloadAdminReport() {
  const token = tokenStore.get();
  let response;
  try {
    response = await fetch(`${BASE_URL}/admin/report`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }
  if (!response.ok) {
    let message = 'Could not download the report.';
    try {
      const data = await response.json();
      if (typeof data?.message === 'string') message = data.message;
    } catch {
      /* a non-JSON error body (e.g. a proxy page); the generic message above is shown instead */
    }
    throw new ApiError(message, response.status);
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'hustlehub-report.csv';
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---- chat between client and freelancer ----
export const startConversation = (gigId) => request('/conversations', { method: 'POST', body: { gigId } });
export const listConversations = () => request('/conversations');
export const listMessages = (conversationId, before) => request(`/conversations/${conversationId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`);
export const sendMessageRest = (conversationId, text) => request(`/conversations/${conversationId}/messages`, { method: 'POST', body: { text } });
export const markConversationRead = (conversationId) => request(`/conversations/${conversationId}/read`, { method: 'PATCH' });
