import { useState } from 'react';
import Alert from '../components/Alert';
import DataState from '../components/DataState';
import StatusPill from '../components/StatusPill';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useToast } from '../components/Toast';
import * as api from '../api/hustlehub';
import BreakdownBars from '../components/BreakdownBars';
import TrendChart from '../components/TrendChart';
import { formatDate, formatRand, pluralise } from '../utils/format';
import { topicLabel, categoryLabel } from '../utils/constants';
import { decodeEntities } from '../utils/text';
import { useAsync } from '../utils/useAsync';
import { useTitle } from '../utils/useTitle';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'gigs', label: 'Gigs' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'escrow', label: 'Active bookings' },
  { id: 'disputes', label: 'Disputes' },
  { id: 'messages', label: 'Messages' },
];

const ESCROW_STATUS_LABEL = { held: 'Held', awaiting_review: 'Awaiting client review' };
const ESCROW_STATUS_TONE = { held: 'neutral', awaiting_review: 'info' };

function timeUntil(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'shortly';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  return `in ${Math.round(hours / 24)} days`;
}

const ACTIVITY_ICON = { user: '👤', booking: '📦', message: '✉️' };

function timeAgo(iso) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Overview() {
  const { data, loading, error, errorStatus, reload } = useAsync(() => api.adminStats());
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const download = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      await api.downloadAdminReport();
    } catch (err) {
      setDownloadError(err.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <DataState loading={loading} error={error} errorStatus={errorStatus} onRetry={reload}>
      {data && (
        <>
          <div className="overview-report-bar">
            <p className="muted small">One row per user: gigs listed, bookings, and money earned or spent.</p>
            <button type="button" className="btn btn-quiet" onClick={download} disabled={downloading}>
              {downloading ? 'Preparing…' : 'Download report (CSV)'}
            </button>
          </div>
          <Alert>{downloadError}</Alert>
          <dl className="ledger" aria-label="Platform totals">
            <div>
              <dt>Users</dt>
              <dd>{data.users.total}</dd>
              <p className="muted small">
                {data.users.freelancers} freelancers, {data.users.clients} clients, {data.users.admins} admin{data.users.admins === 1 ? '' : 's'}
              </p>
              <p className="muted small">{data.users.newThisWeek} new this week</p>
            </div>
            <div>
              <dt>Gigs</dt>
              <dd>{data.gigs.total}</dd>
              <p className="muted small">{data.gigs.active} live</p>
            </div>
            <div>
              <dt>Bookings</dt>
              <dd>{data.bookings.total}</dd>
            </div>
            <div>
              <dt>Money moved (simulated)</dt>
              <dd>{formatRand(data.transactions.volume)}</dd>
              <p className="muted small">{pluralise(data.transactions.count, 'transaction')}</p>
            </div>
            <div>
              <dt>New messages</dt>
              <dd>{data.messages.new}</dd>
            </div>
          </dl>

          <div className="overview-grid">
            <section className="panel overview-card" aria-labelledby="trend-title">
              <h2 id="trend-title">Transactions, last 14 days</h2>
              <TrendChart points={data.transactions.trend} formatValue={formatRand} />
            </section>

            <section className="panel overview-card" aria-labelledby="gigs-by-cat-title">
              <h2 id="gigs-by-cat-title">Gigs by category</h2>
              <BreakdownBars data={data.gigs.byCategory} labelFor={categoryLabel} />
            </section>

            <section className="panel overview-card" aria-labelledby="bookings-by-status-title">
              <h2 id="bookings-by-status-title">Bookings by status</h2>
              <BreakdownBars data={data.bookings.byStatus} labelFor={(s) => s[0].toUpperCase() + s.slice(1)} />
            </section>

            <section className="panel overview-card overview-activity" aria-labelledby="activity-title">
              <h2 id="activity-title">Recent activity</h2>
              {data.activity.length === 0 ? (
                <p className="muted small">Nothing has happened yet.</p>
              ) : (
                <ul className="activity-feed">
                  {data.activity.map((a, i) => (
                    <li key={i}>
                      <span className="activity-icon" aria-hidden="true">
                        {ACTIVITY_ICON[a.kind]}
                      </span>
                      <span>{a.text}</span>
                      <span className="muted small activity-time">{timeAgo(a.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </DataState>
  );
}

function Users() {
  const { user: me } = useAuth();
  const { data, loading, error, errorStatus, reload } = useAsync(() => api.adminUsers());
  const [actionError, setActionError] = useState('');
  const [search, setSearch] = useState('');

  const toggle = async (u) => {
    setActionError('');
    try {
      await api.adminSetUserStatus(u.id, !u.isActive);
      reload();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const q = search.trim().toLowerCase();
  const users = (data?.users ?? []).filter(
    (u) => !q || decodeEntities(u.name).toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q)
  );

  return (
    <DataState loading={loading && !data} error={error} errorStatus={errorStatus} onRetry={reload}>
      <Alert>{actionError}</Alert>
      <div className="admin-search">
        <label className="sr-only" htmlFor="user-search">
          Search users
        </label>
        <input id="user-search" type="search" placeholder="Search by name, email or role…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {search && (
        <p className="muted small admin-search-count">
          {pluralise(users.length, 'result')} for "{search}"
        </p>
      )}
      <ul className="rows" aria-label="Users">
        {users.map((u) => (
          <li key={u.id} className="row">
            <div className="row-main">
              <h3>{decodeEntities(u.name)}</h3>
              <p className="muted">
                {u.email} · joined {formatDate(u.createdAt)}
              </p>
            </div>
            <StatusPill tone="neutral">{u.role}</StatusPill>
            <StatusPill tone={u.isActive ? 'good' : 'muted'}>{u.isActive ? 'Active' : 'Disabled'}</StatusPill>
            <div className="row-actions">
              {u.role !== 'admin' && u.id !== me.id && (
                <button type="button" className="btn btn-quiet" onClick={() => toggle(u)}>
                  {u.isActive ? 'Disable' : 'Enable'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {search && users.length === 0 && <p className="muted admin-search-empty">No users match "{search}".</p>}
    </DataState>
  );
}

function Gigs() {
  const { data, loading, error, errorStatus, reload } = useAsync(() => api.adminGigs());
  const [confirmId, setConfirmId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [search, setSearch] = useState('');

  const remove = async (id) => {
    setActionError('');
    setConfirmId(null);
    try {
      await api.adminDeleteGig(id);
      reload();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const q = search.trim().toLowerCase();
  const gigs = (data?.gigs ?? []).filter(
    (g) => !q || decodeEntities(g.title).toLowerCase().includes(q) || decodeEntities(g.freelancer?.name ?? '').toLowerCase().includes(q)
  );

  return (
    <DataState loading={loading && !data} error={error} errorStatus={errorStatus} onRetry={reload}>
      <Alert>{actionError}</Alert>
      <div className="admin-search">
        <label className="sr-only" htmlFor="gig-search">
          Search gigs
        </label>
        <input id="gig-search" type="search" placeholder="Search by gig title or freelancer…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {search && (
        <p className="muted small admin-search-count">
          {pluralise(gigs.length, 'result')} for "{search}"
        </p>
      )}
      <ul className="rows" aria-label="All gigs">
        {gigs.map((g) => (
          <li key={g.id} className="row">
            <div className="row-main">
              <h3>{decodeEntities(g.title)}</h3>
              <p className="muted">
                by {decodeEntities(g.freelancer?.name ?? '')} · {formatRand(g.price)}
              </p>
            </div>
            <StatusPill tone={g.isActive ? 'good' : 'muted'}>{g.isActive ? 'Live' : 'Paused'}</StatusPill>
            <div className="row-actions">
              {confirmId === g.id ? (
                <>
                  <button type="button" className="btn btn-danger" onClick={() => remove(g.id)}>
                    Confirm removal
                  </button>
                  <button type="button" className="btn btn-quiet" onClick={() => setConfirmId(null)}>
                    Keep
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-quiet" onClick={() => setConfirmId(g.id)}>
                  Remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {search && gigs.length === 0 && <p className="muted admin-search-empty">No gigs match "{search}".</p>}
    </DataState>
  );
}

function Transactions() {
  const { data, loading, error, errorStatus, reload } = useAsync(() => api.adminTransactions());
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const transactions = (data?.transactions ?? []).filter(
    (t) =>
      !q ||
      t.reference.toLowerCase().includes(q) ||
      decodeEntities(t.gigTitle).toLowerCase().includes(q) ||
      decodeEntities(t.client?.name ?? '').toLowerCase().includes(q) ||
      decodeEntities(t.freelancer?.name ?? '').toLowerCase().includes(q)
  );

  return (
    <DataState loading={loading} error={error} errorStatus={errorStatus} onRetry={reload} empty={(data?.transactions ?? []).length === 0} emptyTitle="No transactions yet">
      <div className="admin-search">
        <label className="sr-only" htmlFor="transaction-search">
          Search transactions
        </label>
        <input
          id="transaction-search"
          type="search"
          placeholder="Search by reference, gig, client or freelancer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {search && (
        <p className="muted small admin-search-count">
          {pluralise(transactions.length, 'result')} for "{search}"
        </p>
      )}
      <ul className="rows" aria-label="All transactions">
        {transactions.map((t) => (
          <li key={t.id} className="row">
            <div className="row-main">
              <h3>{decodeEntities(t.gigTitle)}</h3>
              <p className="muted">
                {decodeEntities(t.client?.name ?? '')} paid {decodeEntities(t.freelancer?.name ?? '')} · {formatDate(t.createdAt)} · {t.reference}
              </p>
            </div>
            {t.status === 'refunded' ? (
              <span className="row-side">
                <StatusPill tone="danger">Refunded</StatusPill>
                <s className="amount muted">{formatRand(t.amount)}</s>
              </span>
            ) : (
              <strong className="amount">{formatRand(t.amount)}</strong>
            )}
          </li>
        ))}
      </ul>
      {search && transactions.length === 0 && <p className="muted admin-search-empty">No transactions match "{search}".</p>}
    </DataState>
  );
}

// "Active bookings": every booking whose money the platform is currently holding - either just paid
// (held) or completed and sitting in the client's review window (awaiting_review). Not disputed ones;
// those get their own tab since they need a decision, not just watching.
function Escrow() {
  const { data, loading, error, errorStatus, reload } = useAsync(() => api.adminEscrow());
  const bookings = data?.bookings ?? [];

  return (
    <DataState
      loading={loading && !data}
      error={error}
      errorStatus={errorStatus}
      onRetry={reload}
      empty={!loading && bookings.length === 0}
      emptyTitle="Nothing currently held"
      emptyText="Money the platform is holding for an active booking will show up here."
    >
      {data && (
        <dl className="ledger" aria-label="Escrow totals">
          <div>
            <dt>Currently held</dt>
            <dd>{formatRand(data.totalHeld)}</dd>
            <p className="muted small">across {pluralise(bookings.length, 'active booking')}</p>
          </div>
        </dl>
      )}
      <ul className="rows" aria-label="Active bookings">
        {bookings.map((b) => (
          <li key={b.id} className="row">
            <div className="row-main">
              <h3>{decodeEntities(b.gigTitle)}</h3>
              <p className="muted">
                {decodeEntities(b.client?.name ?? '')} → {decodeEntities(b.freelancer?.name ?? '')} · {formatDate(b.createdAt)}
              </p>
              {b.escrowStatus === 'awaiting_review' && b.reviewDeadline && (
                <p className="muted small">Auto-releases {timeUntil(b.reviewDeadline)} unless the client acts first.</p>
              )}
            </div>
            <StatusPill tone={ESCROW_STATUS_TONE[b.escrowStatus]}>{ESCROW_STATUS_LABEL[b.escrowStatus]}</StatusPill>
            <strong className="amount">{formatRand(b.price)}</strong>
          </li>
        ))}
      </ul>
    </DataState>
  );
}

function Disputes() {
  const { data, loading, error, errorStatus, reload } = useAsync(() => api.adminDisputes());
  const [actionError, setActionError] = useState('');
  const [resolving, setResolving] = useState(null);
  const toast = useToast();
  const disputes = data?.bookings ?? [];

  const resolve = async (id, resolution) => {
    setActionError('');
    setResolving(id);
    try {
      await api.adminResolveDispute(id, resolution);
      toast(resolution === 'released' ? 'Released to the freelancer.' : 'Refunded to the client.');
      reload();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setResolving(null);
    }
  };

  return (
    <DataState
      loading={loading && !data}
      error={error}
      errorStatus={errorStatus}
      onRetry={reload}
      empty={!loading && disputes.length === 0}
      emptyTitle="No open disputes"
      emptyText="When a client flags a problem with a completed booking, it shows up here for a decision."
    >
      <Alert>{actionError}</Alert>
      <ul className="rows" aria-label="Disputes">
        {disputes.map((b) => (
          <li key={b.id} className="row">
            <div className="row-main">
              <h3>{decodeEntities(b.gigTitle)}</h3>
              <p className="muted">
                {decodeEntities(b.client?.name ?? '')} vs {decodeEntities(b.freelancer?.name ?? '')} · flagged {formatDate(b.disputedAt)}
              </p>
              {b.disputeReason && <p className="row-note dispute-note">“{decodeEntities(b.disputeReason)}”</p>}
            </div>
            <strong className="amount">{formatRand(b.price)}</strong>
            <div className="row-actions">
              <button type="button" className="btn btn-primary" onClick={() => resolve(b.id, 'released')} disabled={resolving === b.id}>
                {resolving === b.id ? 'Working…' : 'Release to freelancer'}
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => resolve(b.id, 'refunded')} disabled={resolving === b.id}>
                Refund client
              </button>
            </div>
          </li>
        ))}
      </ul>
    </DataState>
  );
}

const MESSAGE_FILTERS = [
  { id: '', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'read', label: 'Read' },
  { id: 'resolved', label: 'Resolved' },
];
const STATUS_TONE = { new: 'good', read: 'neutral', resolved: 'muted' };

// The address goes through encodeURIComponent so odd characters in it can never add extra mail headers.
const replyLink = (m) => `mailto:${encodeURIComponent(m.email).replace('%40', '@')}?subject=${encodeURIComponent(`Re: HustleHub+ ${m.reference}`)}`;

function ReplyThread({ replies }) {
  if (!replies || replies.length === 0) return null;
  return (
    <ul className="reply-thread" aria-label="Replies sent so far">
      {replies.map((r, i) => (
        <li key={i} className="reply-thread-item">
          <div className="message-meta muted">
            <strong>{decodeEntities(r.adminName)}</strong>
            <span>{formatDate(r.sentAt)}</span>
          </div>
          <p className="message-body">{decodeEntities(r.text)}</p>
        </li>
      ))}
    </ul>
  );
}

function ReplyForm({ message, onSent, onCancel }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async (event) => {
    event.preventDefault();
    if (!text.trim()) {
      setError('Write a reply before sending.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.adminReplyToMessage(message.id, text.trim());
      toast(`Reply sent to ${message.email}.`);
      onSent();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="reply-form" onSubmit={submit} noValidate aria-label={`Reply to ${message.name}`}>
      <Alert>{error}</Alert>
      <label className="sr-only" htmlFor={`reply-${message.id}`}>
        Your reply
      </label>
      <textarea
        id={`reply-${message.id}`}
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError('');
        }}
        maxLength={8000}
        placeholder={`Reply to ${message.name}…`}
      />
      <p className="muted small">We'll email this to {message.email}, quoting {message.reference}.</p>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Sending…' : 'Send reply'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Messages() {
  const [filter, setFilter] = useState('');
  const { data, loading, error, errorStatus, reload } = useAsync(() => api.adminMessages(filter), [filter]);
  const [actionError, setActionError] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);

  const setStatus = async (m, status) => {
    setActionError('');
    try {
      await api.adminSetMessageStatus(m.id, status);
      reload();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const counts = data?.counts;
  const total = counts ? counts.new + counts.read + counts.resolved : 0;
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const messages = (data?.messages ?? []).filter(
    (m) =>
      !q ||
      m.reference.toLowerCase().includes(q) ||
      decodeEntities(m.name).toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      decodeEntities(m.message).toLowerCase().includes(q)
  );

  return (
    <>
      <div className="chips" role="group" aria-label="Filter messages">
        {MESSAGE_FILTERS.map((f) => (
          <button key={f.id || 'all'} type="button" className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
            {counts ? ` (${f.id ? counts[f.id] : total})` : ''}
          </button>
        ))}
      </div>
      <div className="admin-search">
        <label className="sr-only" htmlFor="message-search">
          Search messages
        </label>
        <input
          id="message-search"
          type="search"
          placeholder="Search by reference (e.g. MSG-072FE2AA), sender or message…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {search && (
        <p className="muted small admin-search-count">
          {pluralise(messages.length, 'result')} for "{search}"
        </p>
      )}
      <Alert>{actionError}</Alert>
      <DataState
        loading={loading && !data}
        error={error}
        errorStatus={errorStatus}
        onRetry={reload}
        empty={!loading && (data?.messages ?? []).length === 0}
        emptyTitle={filter ? `No ${filter} messages` : 'No messages yet'}
        emptyText="Messages sent from the Contact page appear here."
      >
        <ul className="rows" aria-label="Messages">
          {messages.map((m) => (
            <li key={m.id} className="row">
              <div className="row-main">
                <h3>{decodeEntities(m.name)}</h3>
                <div className="message-meta muted">
                  <a href={replyLink(m)}>{m.email}</a>
                  <span>{formatDate(m.createdAt)}</span>
                  <span>{m.reference}</span>
                  {m.user && <span>Signed-in {m.user.role}</span>}
                  {m.replies?.length > 0 && (
                    <span>
                      {m.replies.length} {m.replies.length === 1 ? 'reply' : 'replies'} sent
                    </span>
                  )}
                </div>
                <p className="message-body">{decodeEntities(m.message)}</p>
                <ReplyThread replies={m.replies} />
              </div>
              <span className="pill pill-neutral pill-plain">{topicLabel(m.topic)}</span>
              <StatusPill tone={STATUS_TONE[m.status]}>{m.status}</StatusPill>
              <div className="row-actions">
                {replyingTo !== m.id && (
                  <button type="button" className="btn btn-primary" onClick={() => setReplyingTo(m.id)}>
                    Reply
                  </button>
                )}
                {m.status !== 'read' && m.status !== 'resolved' && (
                  <button type="button" className="btn btn-quiet" onClick={() => setStatus(m, 'read')}>
                    Mark read
                  </button>
                )}
                {m.status !== 'resolved' ? (
                  <button type="button" className="btn btn-quiet" onClick={() => setStatus(m, 'resolved')}>
                    Mark resolved
                  </button>
                ) : (
                  <button type="button" className="btn btn-quiet" onClick={() => setStatus(m, 'new')}>
                    Reopen
                  </button>
                )}
              </div>
              {replyingTo === m.id && (
                <div className="row-extra">
                  <ReplyForm
                    message={m}
                    onCancel={() => setReplyingTo(null)}
                    onSent={() => {
                      setReplyingTo(null);
                      reload();
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </DataState>
    </>
  );
}

const PANELS = { overview: Overview, users: Users, gigs: Gigs, transactions: Transactions, escrow: Escrow, disputes: Disputes, messages: Messages };

export default function AdminPage() {
  useTitle('Administration');
  const [tab, setTab] = useState('overview');
  const { supportUnread } = useChat();
  const Panel = PANELS[tab];

  return (
    <>
      <header className="page-head">
        <h1>Administration</h1>
        <p className="muted">Oversee users, gigs, transactions and messages across the platform.</p>
      </header>
      <div className="tabs" role="tablist" aria-label="Administration sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="admin-panel"
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'messages' && !!supportUnread && (
              <span className="nav-badge" aria-label={`, ${supportUnread} new`}>
                {supportUnread > 9 ? '9+' : supportUnread}
              </span>
            )}
          </button>
        ))}
      </div>
      <div id="admin-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="section">
        <Panel />
      </div>
    </>
  );
}
