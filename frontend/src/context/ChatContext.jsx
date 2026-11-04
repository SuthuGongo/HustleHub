import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { tokenStore } from '../utils/tokenStore';
import { listConversations, contactMine, adminMessages } from '../api/hustlehub';

const ChatContext = createContext(null);

// One socket connection for the whole app, opened the moment someone is signed in and closed the
// moment they are not - not one per page, which would mean losing (and having to explain losing)
// messages that arrive while looking at a different screen than the conversation itself.
export function ChatProvider({ children }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [unreadTotal, setUnreadTotal] = useState(0);
  // Unrelated to chat, but driven the same way: a badge for the Contact page. For an admin this is how
  // many enquiries are still "new"; for anyone else it is how many of their own past messages have a
  // reply they have not opened yet.
  const [supportUnread, setSupportUnread] = useState(0);
  const listenersRef = useRef(new Set()); // components (the open thread, the conversation list) that want raw events
  const socketRef = useRef(null);

  // The one place the chat badge count is recomputed, whatever triggered the need to: a fresh
  // connection, a live event for this user, or this tab's own markRead() call (which nothing else
  // would otherwise know to refresh for - see markRead below).
  const refreshUnread = useCallback(() => {
    if (!user) return;
    listConversations()
      .then(({ data }) => setUnreadTotal(data.conversations.filter((c) => c.unread).length))
      .catch(() => {}); // a failed badge refresh should never surface as a visible error
  }, [user]);

  const refreshSupportUnread = useCallback(() => {
    if (!user) return;
    const load = user.role === 'admin' ? adminMessages('new').then(({ data }) => data.counts.new) : contactMine().then(({ data }) => data.messages.filter((m) => m.unreadReply).length);
    load.then(setSupportUnread).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      setUnreadTotal(0);
      setSupportUnread(0);
      return undefined;
    }

    const token = tokenStore.get();
    if (!token) return undefined; // between logout and the next render; the effect above will fire again once user clears too

    const socket = io({ path: '/api/socket.io', auth: { token }, reconnectionDelay: 1000, reconnectionDelayMax: 8000 });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    // A token can expire while the tab is open (see AuthContext's own 401-triggered logout for the
    // REST equivalent of this); the socket does not force a logout itself, it just stops delivering
    // live updates until the next login, same as any other background connection would.
    socket.on('connect_error', () => setConnected(false));

    const forward = (event) => (payload) => listenersRef.current.forEach((fn) => fn(event, payload));
    ['message:new', 'conversation:updated', 'typing', 'contact:new', 'contact-reply:new'].forEach((event) => socket.on(event, forward(event)));

    socket.on('connect', refreshUnread);
    socket.on('message:new', refreshUnread);
    socket.on('conversation:updated', refreshUnread);
    refreshUnread();

    socket.on('connect', refreshSupportUnread);
    socket.on('contact:new', refreshSupportUnread); // admin: a new enquiry just arrived
    socket.on('contact-reply:new', refreshSupportUnread); // sender: the team just replied to theirs
    refreshSupportUnread();

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const subscribe = useCallback((fn) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  }, []);

  // Promise-wrapping style, even though the underlying transport is an ack callback, so callers can
  // `await` a send/read the same way they already await every REST call elsewhere in this app.
  const sendMessage = useCallback((conversationId, text) => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current?.connected) return reject(new Error("Not connected. Check your connection and try again."));
      socketRef.current.emit('message:send', { conversationId, text }, (res) => {
        if (res?.error) reject(new Error(res.error));
        else resolve(res.message);
      });
    });
  }, []);

  const markRead = useCallback(
    (conversationId) => {
      return new Promise((resolve, reject) => {
        if (!socketRef.current?.connected) return resolve(); // best-effort; the REST call on page load already caught up
        socketRef.current.emit('message:read', { conversationId }, (res) => {
          if (res?.error) return reject(new Error(res.error));
          refreshUnread(); // nothing else would know to update this tab's own badge after its own read
          resolve();
        });
      });
    },
    [refreshUnread]
  );

  const setTyping = useCallback((conversationId, isTyping) => {
    socketRef.current?.emit('typing', { conversationId, isTyping });
  }, []);

  const value = useMemo(
    () => ({ connected, unreadTotal, supportUnread, refreshSupportUnread, subscribe, sendMessage, markRead, setTyping }),
    [connected, unreadTotal, supportUnread, refreshSupportUnread, subscribe, sendMessage, markRead, setTyping]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside <ChatProvider>.');
  return ctx;
}
