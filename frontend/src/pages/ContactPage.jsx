import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Alert from '../components/Alert';
import DataState from '../components/DataState';
import StatusPill from '../components/StatusPill';
import { SelectField, TextAreaField, TextField } from '../components/Fields';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import * as api from '../api/hustlehub';
import { CONTACT_TOPICS, topicLabel } from '../utils/constants';
import { formatDate } from '../utils/format';
import { decodeEntities } from '../utils/text';
import { useAsync } from '../utils/useAsync';
import { useTitle } from '../utils/useTitle';
import { validateContact } from '../utils/validation';

const MAX = 2000;
const STATUS_TONE = { new: 'good', read: 'neutral', resolved: 'muted' };

// The reply thread under one of the person's own past messages: whichever side sent which part, in
// order. The admin's own name is never shown here (an internal detail - "The team" is all a sender
// needs to know), and the sender's own follow-ups are labelled "You" so the back-and-forth reads clearly.
function ReplyThread({ replies }) {
  if (!replies || replies.length === 0) return null;
  return (
    <ul className="reply-thread" aria-label="Conversation so far">
      {replies.map((r, i) => (
        <li key={i} className={`reply-thread-item${r.from === 'sender' ? ' reply-thread-item-mine' : ''}`}>
          <div className="message-meta muted">
            <strong>{r.from === 'sender' ? 'You' : 'The team'}</strong>
            <span>{formatDate(r.sentAt)}</span>
          </div>
          <p className="message-body">{decodeEntities(r.text)}</p>
        </li>
      ))}
    </ul>
  );
}

// The box for following up on a message that's already been sent - most useful once the team has
// replied and the issue still isn't actually fixed, but not gated behind that: adding more detail
// before anyone has answered yet is just as legitimate a reason to use it.
function FollowUpForm({ message, onSent, onCancel }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!text.trim()) {
      setError('Write a message before sending.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.replyToOwnMessage(message.id, text.trim());
      onSent();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="reply-form" onSubmit={submit} noValidate aria-label={`Follow up on ${message.reference}`}>
      <Alert>{error}</Alert>
      <label className="sr-only" htmlFor={`followup-${message.id}`}>
        Your follow-up
      </label>
      <textarea
        id={`followup-${message.id}`}
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError('');
        }}
        maxLength={8000}
        placeholder="What's still not sorted?"
      />
      <p className="muted small">This reopens {message.reference} so the team sees it again.</p>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Sending…' : 'Send follow-up'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// Shown only to a signed-in person, and only once they have actually sent something: this is what
// answers "did anyone reply?" from right inside the app, rather than relying only on email arriving -
// the same conversation history a chat thread would show, for messages sent to the support team instead
// of another person. Opening this page is what "seen" means, the same pattern chat conversations use.
function YourMessages() {
  const { data, loading, error, reload } = useAsync(() => api.contactMine());
  const { refreshSupportUnread } = useChat();
  const [replyingTo, setReplyingTo] = useState(null);
  const messages = data?.messages ?? [];

  useEffect(() => {
    if (messages.some((m) => m.unreadReply)) {
      api.markContactMineSeen().then(refreshSupportUnread).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  if (loading && !data && !error) return null; // don't flash an empty panel during the very first fetch
  if (!error && messages.length === 0) return null; // resolved, and truly nothing to show

  return (
    <section className="panel your-messages" aria-label="Your messages to the team">
      <h2>Your messages</h2>
      <DataState loading={loading} error={error} onRetry={reload}>
        <ul className="your-messages-list">
          {messages.map((m) => (
            <li key={m.id} className="your-message-item">
              <div className="message-meta muted">
                <span>{formatDate(m.createdAt)}</span>
                <span>{m.reference}</span>
                <span className="pill pill-neutral pill-plain">{topicLabel(m.topic)}</span>
                <StatusPill tone={STATUS_TONE[m.status]}>{m.status}</StatusPill>
                {m.unreadReply && (
                  <span className="pill pill-good" aria-label="This reply is new">
                    New reply
                  </span>
                )}
              </div>
              <p className="message-body">{decodeEntities(m.message)}</p>
              <ReplyThread replies={m.replies} />
              {replyingTo === m.id ? (
                <div className="row-extra">
                  <FollowUpForm
                    message={m}
                    onCancel={() => setReplyingTo(null)}
                    onSent={() => {
                      setReplyingTo(null);
                      reload();
                    }}
                  />
                </div>
              ) : (
                <button type="button" className="btn btn-quiet your-message-reply-btn" onClick={() => setReplyingTo(m.id)}>
                  Reply
                </button>
              )}
            </li>
          ))}
        </ul>
      </DataState>
    </section>
  );
}

// The page the Help centre leads to: anyone (logged in or not) can send a message to the team.
export default function ContactPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  useTitle('Contact the team');

  // Other pages link here with ?topic=account (etc.) to pre-select what the message is about, and a
  // "Follow up" link from a specific booking adds ?prefill=<context> to open with that context already
  // typed in, ready for the person to add their own words rather than starting from a blank box.
  const requestedTopic = CONTACT_TOPICS.some((t) => t.value === params.get('topic')) ? params.get('topic') : 'general';
  const prefill = params.get('prefill') || '';
  const [values, setValues] = useState({
    name: user ? decodeEntities(user.name) : '',
    email: user?.email ?? '',
    topic: requestedTopic,
    message: prefill ? `${prefill}\n\n` : '',
    website: '', // invisible spam trap: people never see it, so only bots fill it in
  });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null); // { reference, name } once the message went through
  const [yourMessagesKey, setYourMessagesKey] = useState(0); // bumped after a send, so the list below re-fetches and shows it

  // Editing a field clears its own error straight away, so a corrected mistake stops being shown.
  const change = (field) => (event) => {
    setValues((v) => ({ ...v, [field]: event.target.value }));
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  };

  const submit = async (event) => {
    event.preventDefault();
    const found = validateContact(values);
    setErrors(found);
    setServerError('');
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const { data } = await api.sendContactMessage({
        name: values.name.trim(),
        email: values.email.trim(),
        topic: values.topic,
        message: values.message.trim(),
        website: values.website,
      });
      setSent({ reference: data.reference, name: values.name.trim().split(' ')[0] });
      setYourMessagesKey((k) => k + 1);
    } catch (err) {
      setServerError(err.message); // includes the wait time if the person is sending too many messages
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <section className="contact-sent" aria-labelledby="sent-title">
        <h1 id="sent-title">Thank you, {sent.name}</h1>
        <p>Your message is with the team. We'll reply to the email address you gave us.</p>
        <p className="contact-ref">
          Your reference: <strong>{sent.reference}</strong>
        </p>
        <p className="muted">Keep this reference in case you need to follow up.</p>
        <div className="status-actions">
          <Link className="btn btn-primary" to="/">
            Back to home
          </Link>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setSent(null);
              setValues((v) => ({ ...v, message: '', website: '' }));
            }}
          >
            Send another message
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <header className="page-head">
        <h1>Contact the team</h1>
        <p className="muted">Send us a message and we'll reply by email.</p>
      </header>

      {user && <YourMessages key={yourMessagesKey} />}

      <div className="contact-layout">
        <form className="panel contact-form" onSubmit={submit} noValidate aria-label="Contact the team">
          <Alert>{serverError}</Alert>
          <TextField label="Your name" value={values.name} onChange={change('name')} error={errors.name} autoComplete="name" maxLength={80} />
          <TextField label="Email address" type="email" value={values.email} onChange={change('email')} error={errors.email} autoComplete="email" maxLength={254} hint="We'll reply to this address." />
          <SelectField label="What is it about?" value={values.topic} onChange={change('topic')} error={errors.topic} options={CONTACT_TOPICS} />
          <TextAreaField
            label="Your message"
            rows={7}
            value={values.message}
            onChange={change('message')}
            error={errors.message}
            maxLength={MAX + 200}
            hint={`Tell us what happened or what you need. ${values.message.trim().length} / ${MAX}`}
          />

          {/* Spam trap: hidden from people and screen readers, never focusable. Bots fill it in and are ignored. */}
          <div className="hp" aria-hidden="true">
            <label>
              Website
              <input type="text" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={change('website')} />
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send message'}
            </button>
          </div>
        </form>

        <aside className="contact-aside" aria-label="Before you write">
          <h2>Before you write</h2>
          <p>Many questions are answered in the Help centre, and that's usually the quickest way to an answer.</p>
          <Link className="btn btn-quiet" to="/help">
            Browse the Help centre
          </Link>
          <h2>What to include</h2>
          <ul>
            <li>What you were trying to do</li>
            <li>What happened instead</li>
            <li>The gig name, if it's about a booking</li>
          </ul>
          <p className="muted small">Please never send your password or card details in a message. We will never ask for them.</p>
        </aside>
      </div>
    </>
  );
}
