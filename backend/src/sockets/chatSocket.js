const { Server } = require('socket.io');
const User = require('../models/User');
const { verifyToken } = require('../utils/token');
const { setIo } = require('../services/socketService');
const { sendMessage, markRead, loadConversationForParticipant } = require('../services/chatService');
const { isRateLimited } = require('../utils/socketRateLimiter');
const { corsOrigin } = require('../config/env');

// Verifies a socket's auth token exactly the way authenticate.js verifies an HTTP request's: same
// signature/algorithm check, same "load the user fresh from the database, never trust the token's own
// claims for role/active status" rule, and the same rejection of a pending 2FA/verify-email token (it
// carries a `stage` claim; a real session token never does) - a half-finished login must not be able to
// open a live chat connection any more than it can reach a real page over HTTP.
async function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('unauthorized'));
    const decoded = verifyToken(token);
    if (decoded.stage) return next(new Error('unauthorized'));
    const user = await User.findById(decoded.id).select('role isActive');
    if (!user || !user.isActive) return next(new Error('unauthorized'));
    socket.user = { id: user.id, role: user.role };
    next();
  } catch {
    next(new Error('unauthorized'));
  }
}

function initChatSocket(server) {
  const io = new Server(server, {
    // Mounted under /api so it reuses the same same-origin reverse proxy rule as the REST API (see
    // frontend/vite.config.js) instead of needing a second one - and, in production, so the socket
    // connection is same-origin, satisfying the strict `connect-src 'self'` CSP the frontend serves.
    // A cross-origin socket would either be silently blocked by that CSP or force it to be loosened,
    // which this avoids entirely.
    path: '/api/socket.io',
    cors: { origin: corsOrigin.split(',').map((o) => o.trim()), credentials: true },
  });

  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    // A personal room per signed-in user (not per conversation): see socketService.js for why - it lets
    // any part of the backend push to "this user, on every tab/device", including from a plain REST
    // request, without the socket handler needing to know which conversations are currently open.
    socket.join(`user:${socket.user.id}`);
    // A room per role too, so a REST request (a new contact message, say) can notify "every admin
    // online right now" without knowing which specific admin accounts exist - see emitToRole().
    socket.join(`role:${socket.user.role}`);

    socket.on('message:send', async ({ conversationId, text } = {}, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        if (isRateLimited(socket.user.id)) {
          return reply({ error: 'Too many messages. Please slow down.' });
        }
        const { message } = await sendMessage({ conversationId, senderId: socket.user.id, text });
        reply({ message: message.toJSON() }); // the sender's own optimistic-send confirmation
      } catch (err) {
        reply({ error: err.message || 'Could not send that message.' });
      }
    });

    socket.on('message:read', async ({ conversationId } = {}, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        await markRead({ conversationId, userId: socket.user.id });
        reply({ ok: true });
      } catch (err) {
        reply({ error: err.message || 'Could not mark that as read.' });
      }
    });

    // Typing indicators are best-effort and ephemeral - never stored, and a bad conversationId here just
    // does nothing rather than raising an error, since nothing of consequence depends on this succeeding.
    socket.on('typing', async ({ conversationId, isTyping } = {}) => {
      try {
        const conversation = await loadConversationForParticipant(conversationId, socket.user.id);
        const recipientId = String(conversation.client) === socket.user.id ? conversation.freelancer : conversation.client;
        io.to(`user:${recipientId}`).emit('typing', { conversationId, isTyping: Boolean(isTyping) });
      } catch {
        /* silently ignore - see comment above */
      }
    });
  });

  setIo(io);
  return io;
}

module.exports = { initChatSocket };
