import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import * as api from '../api/hustlehub';
import Avatar from '../components/Avatar';
import DataState from '../components/DataState';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { decodeEntities } from '../utils/text';
import { useAsync } from '../utils/useAsync';
import { useTitle } from '../utils/useTitle';

const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
const dayOf = (iso) => new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
const sameDay = (a, b) => dayOf(a) === dayOf(b);

function otherParty(conversation, myId) {
  return conversation.client.id === myId ? conversation.freelancer : conversation.client;
}

function ConversationRow({ conversation, myId, active, onClick }) {
  const them = otherParty(conversation, myId);
  return (
    <li>
      <button type="button" className={`conv-row${active ? ' active' : ''}`} onClick={onClick} aria-current={active}>
        <Avatar name={them.name} size="sm" />
        <span className="conv-row-body">
          <span className="conv-row-top">
            <strong>{decodeEntities(them.name)}</strong>
            <span className="muted small">{timeOf(conversation.lastMessageAt)}</span>
          </span>
          {conversation.gigTitle && <span className="conv-row-gig muted small">{decodeEntities(conversation.gigTitle)}</span>}
          <span className="conv-row-preview muted small">{decodeEntities(conversation.lastMessagePreview) || 'Say hello…'}</span>
        </span>
        {conversation.unread && (
          <span className="conv-unread-dot" aria-label="Unread">
            •
          </span>
        )}
      </button>
    </li>
  );
}

function Thread({ conversation, myId, paymentNotice }) {
  const { subscribe, sendMessage, markRead, setTyping } = useChat();
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [theirTyping, setTheirTyping] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const bottomRef = useRef(null);
  const typingTimeout = useRef(null);
  const them = otherParty(conversation, myId);
  const showPaymentNotice = Boolean(paymentNotice) && !noticeDismissed;

  useEffect(() => {
    let cancelled = false;
    setMessages(null);
    setError('');
    api
      .listMessages(conversation.id)
      .then(({ data }) => !cancelled && setMessages(data.messages))
      .catch((err) => !cancelled && setError(err.message));
    markRead(conversation.id).catch(() => {}); // best-effort; opening the thread is what "read" means here
    return () => {
      cancelled = true;
    };
  }, [conversation.id, markRead]);

  useEffect(() => {
    return subscribe((event, payload) => {
      if (payload?.conversationId !== conversation.id) return;
      if (event === 'message:new') {
        setMessages((prev) => (prev ? [...prev, payload.message] : prev));
        markRead(conversation.id).catch(() => {}); // the thread is open and visible, so this arrival is "read" too
      } else if (event === 'typing') {
        setTheirTyping(Boolean(payload.isTyping));
        if (payload.isTyping) {
          clearTimeout(typingTimeout.current);
          typingTimeout.current = setTimeout(() => setTheirTyping(false), 4000); // in case a "stopped" event is lost
        }
      }
    });
  }, [conversation.id, subscribe, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length]);

  const onTextChange = (event) => {
    setText(event.target.value);
    setTyping(conversation.id, true);
  };

  // Tells the other side "stopped typing" a beat after the last keystroke, rather than the instant the
  // box empties - so a brief pause mid-sentence doesn't flicker the indicator on and off.
  useEffect(() => {
    if (!text) return undefined;
    const timer = setTimeout(() => setTyping(conversation.id, false), 1500);
    return () => clearTimeout(timer);
  }, [text, conversation.id, setTyping]);

  const submit = async (event) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    setSending(true);
    setError('');
    setTyping(conversation.id, false);
    try {
      const message = await sendMessage(conversation.id, value);
      setMessages((prev) => (prev ? [...prev, message] : prev));
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="thread">
      <header className="thread-head">
        <Avatar name={them.name} size="sm" />
        <div>
          <strong>{decodeEntities(them.name)}</strong>
          {conversation.gigTitle && <p className="muted small">{decodeEntities(conversation.gigTitle)}</p>}
        </div>
      </header>

      {showPaymentNotice && (
        <div className="thread-notice" role="status">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </svg>
          <span>
            Payment confirmed{paymentNotice.gigTitle ? ` for "${decodeEntities(paymentNotice.gigTitle)}"` : ''}! Let{' '}
            {decodeEntities(them.name)} know anything specific before they begin.
          </span>
          <button type="button" className="thread-notice-close" aria-label="Dismiss" onClick={() => setNoticeDismissed(true)}>
            ✕
          </button>
        </div>
      )}

      <div className="thread-body" aria-live="polite">
        <DataState loading={messages === null && !error} error={error}>
          {messages && messages.length === 0 && <p className="thread-empty muted">No messages yet. Say hello!</p>}
          {messages?.map((m, i) => {
            const mine = m.sender?.id === myId || m.sender === myId;
            const showDay = i === 0 || !sameDay(messages[i - 1].createdAt, m.createdAt);
            return (
              <div key={m.id}>
                {showDay && <p className="thread-day muted small">{dayOf(m.createdAt)}</p>}
                <div className={`bubble-row${mine ? ' mine' : ''}`}>
                  <div className="bubble">
                    <p>{decodeEntities(m.text)}</p>
                    <span className="bubble-time">{timeOf(m.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {theirTyping && (
            <div className="bubble-row">
              <div className="bubble bubble-typing" aria-label={`${decodeEntities(them.name)} is typing`}>
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </DataState>
      </div>

      <form className="thread-composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="chat-text">
          Message
        </label>
        <textarea id="chat-text" rows={1} value={text} onChange={onTextChange} maxLength={4000} placeholder={`Message ${decodeEntities(them.name)}…`} />
        <button type="submit" className="btn btn-primary" disabled={sending || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

export default function MessagesPage() {
  useTitle('Messages');
  const { user } = useAuth();
  const { subscribe } = useChat();
  const navigate = useNavigate();
  const location = useLocation();
  const { id: activeId } = useParams();
  const { data, loading, error, errorStatus, reload } = useAsync(() => api.listConversations());
  const conversations = useMemo(() => data?.conversations ?? [], [data]);

  const refresh = useCallback(() => reload(), [reload]);
  useEffect(() => subscribe((event) => (event === 'conversation:updated' || event === 'message:new') && refresh()), [subscribe, refresh]);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  return (
    <div className="messages-page">
      <header className="page-head">
        <h1>Messages</h1>
        <p className="muted">Conversations between you and {user.role === 'client' ? 'freelancers' : 'clients'}.</p>
      </header>

      <div className="messages-layout">
        <DataState
          loading={loading && !data}
          error={error}
          errorStatus={errorStatus}
          onRetry={reload}
          empty={!loading && conversations.length === 0}
          emptyTitle="No conversations yet"
          emptyText={user.role === 'client' ? 'Message a seller from any gig page to start one.' : 'Conversations appear here once a client messages you about a gig.'}
        >
          <ul className="conv-list" aria-label="Conversations">
            {conversations.map((c) => (
              <ConversationRow key={c.id} conversation={c} myId={user.id} active={c.id === activeId} onClick={() => navigate(`/messages/${c.id}`)} />
            ))}
          </ul>
        </DataState>

        {active ? (
          <Thread key={active.id} conversation={active} myId={user.id} paymentNotice={location.state?.justPaid ? location.state : null} />
        ) : (
          <div className="thread thread-placeholder">
            <p className="muted">{conversations.length === 0 ? 'Start a conversation from a gig page.' : 'Choose a conversation to view it.'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
