// A thin holder for the single Socket.IO server instance, set once at start-up (see sockets/chatSocket.js)
// and used from anywhere in the app (controllers included) that needs to push a live event to someone -
// this is what makes a message sent over the plain REST endpoint still arrive instantly for the other
// participant, exactly as if it had been sent over the socket itself: both paths funnel through here.
let io = null;

function setIo(instance) {
  io = instance;
}

// Every authenticated socket joins a room named after its own user id (see chatSocket.js), so pushing
// to "whoever is signed in as this user, on however many tabs/devices they have open" is just this.
function emitToUser(userId, event, payload) {
  if (!io) return; // no socket server in this process (e.g. a script run outside server.js) - never fatal
  io.to(`user:${userId}`).emit(event, payload);
}

// Every authenticated socket also joins a room named after its own role (see chatSocket.js), so an
// event meant for "every admin currently online" - a new enquiry landing in the inbox, say - can be
// pushed once here rather than needing to know which specific admin accounts exist or are connected.
function emitToRole(role, event, payload) {
  if (!io) return;
  io.to(`role:${role}`).emit(event, payload);
}

module.exports = { setIo, emitToUser, emitToRole };
