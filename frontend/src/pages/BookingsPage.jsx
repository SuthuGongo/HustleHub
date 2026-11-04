import { useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '../components/Alert';
import ReviewForm from '../components/ReviewForm';
import { useToast } from '../components/Toast';
import DataState from '../components/DataState';
import StatusPill from '../components/StatusPill';
import { TextAreaField } from '../components/Fields';
import { useAuth } from '../context/AuthContext';
import * as api from '../api/hustlehub';
import { ROLES } from '../utils/constants';
import { formatDate, formatRand } from '../utils/format';
import { decodeEntities } from '../utils/text';
import { useTitle } from '../utils/useTitle';
import { useAsync } from '../utils/useAsync';

// escrowStatus only ever becomes interesting once the work is marked completed (see BookingDialog /
// backend/src/utils/escrow.js) - a plain "confirmed" booking is always just held, with nothing extra
// to show here yet.
const ESCROW_LABEL = { awaiting_review: 'Awaiting your review', disputed: 'Disputed', released: 'Paid out', refunded: 'Refunded' };
const ESCROW_LABEL_FREELANCER = { awaiting_review: 'Awaiting client review', disputed: 'Disputed', released: 'Paid out', refunded: 'Refunded' };
const ESCROW_TONE = { awaiting_review: 'info', disputed: 'danger', released: 'good', refunded: 'muted' };
const ESCROW_HELD = ['held', 'awaiting_review'];

// A friendly "in about 2 days" / "in 45 minutes" for a review deadline, rather than a raw timestamp -
// this is a countdown, not a calendar entry, and the exact minute rarely matters to either party.
function timeUntil(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'shortly';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  return `in ${Math.round(hours / 24)} days`;
}

// Shown under an awaiting-review booking so the client can ask for a refund instead of paying out.
// The reason goes to the freelancer as a message, and to our team to decide - see
// bookingController.disputeEscrow on the backend.
function DisputeForm({ bookingId, onDone, onCancel }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reasonError = reason.trim().length > 0 && reason.trim().length < 5 ? 'Say a little more - at least 5 characters.' : '';

  const submit = async (event) => {
    event.preventDefault();
    if (!reason.trim()) {
      setError('Explain why before submitting.');
      return;
    }
    if (reasonError) return;
    setBusy(true);
    setError('');
    try {
      await api.disputeBooking(bookingId, reason.trim());
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="dispute-form" onSubmit={submit} noValidate aria-label="Ask for a refund on this booking">
      <Alert>{error}</Alert>
      <TextAreaField
        label="Why are you asking for a refund?"
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={reasonError}
        hint="Sent to the freelancer and to our team. Funds stay held until an admin decides. Up to 2000 characters."
        maxLength={2000}
      />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Submitting…' : 'Request refund'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// The freelancer's "how much is still coming to me" summary: everything paid for but not yet
// released, whether the client hasn't reviewed it yet or work hasn't even been marked done.
function PendingPayments({ bookings }) {
  const pending = bookings.filter((b) => ESCROW_HELD.includes(b.escrowStatus));
  if (pending.length === 0) return null;
  const total = pending.reduce((sum, b) => sum + b.price, 0);
  const awaitingReview = pending.filter((b) => b.escrowStatus === 'awaiting_review').length;

  return (
    <section className="pending-payments" aria-label="Pending payments">
      <div>
        <p className="muted small">Pending payments</p>
        <p className="pending-payments-amount">{formatRand(total)}</p>
      </div>
      <p className="muted small">
        {pending.length} booking{pending.length === 1 ? '' : 's'} not yet paid out
        {awaitingReview > 0 && ` · ${awaitingReview} awaiting client review`}
      </p>
    </section>
  );
}

export default function BookingsPage() {
  const { user } = useAuth();
  const isFreelancer = user.role === ROLES.FREELANCER;
  const { data, loading, error, errorStatus, reload } = useAsync(() => api.listBookings());
  const [actionError, setActionError] = useState('');
  const [reviewing, setReviewing] = useState(null);
  const [togglingIssue, setTogglingIssue] = useState(null);
  const [releasing, setReleasing] = useState(null);
  const [disputing, setDisputing] = useState(null);
  const toast = useToast();
  useTitle(isFreelancer ? 'Bookings' : 'My bookings');
  const bookings = data?.bookings ?? [];

  const complete = async (id) => {
    setActionError('');
    try {
      await api.completeBooking(id);
      toast('Booking marked as completed.');
      reload();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const release = async (id) => {
    setActionError('');
    setReleasing(id);
    try {
      await api.releaseBookingFunds(id);
      toast('Funds released to the freelancer.');
      reload();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setReleasing(null);
    }
  };

  const toggleIssue = async (booking) => {
    setActionError('');
    setTogglingIssue(booking.id);
    try {
      await api.setBookingIssue(booking.id, !booking.hasOpenIssue);
      toast(booking.hasOpenIssue ? 'Marked as resolved.' : 'Flagged for the team to see.');
      reload();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setTogglingIssue(null);
    }
  };

  // "Follow up" opens the Contact page with the booking's own context already typed in, so a person
  // never has to explain from scratch which booking they mean - the same idea as the reference number
  // on a Contact-page message, just started from the booking's side instead.
  const followUpLink = (b) => {
    const who = isFreelancer ? decodeEntities(b.client?.name ?? '') : decodeEntities(b.freelancer?.name ?? '');
    const context = `Regarding my booking for "${decodeEntities(b.gigTitle)}" with ${who}, booked ${formatDate(b.createdAt)}:`;
    return `/contact?topic=payment&prefill=${encodeURIComponent(context)}`;
  };

  return (
    <>
      <header className="page-head">
        <h1>{isFreelancer ? 'Bookings' : 'My bookings'}</h1>
        <p className="muted">
          {isFreelancer ? 'Work that clients have booked with you.' : 'Everything you have booked so far.'}
        </p>
      </header>

      {isFreelancer && <PendingPayments bookings={bookings} />}

      <Alert>{actionError}</Alert>

      <DataState
        loading={loading && !data}
        error={error} errorStatus={errorStatus} onRetry={reload}
        empty={!loading && bookings.length === 0}
        emptyTitle="No bookings yet"
        emptyText={isFreelancer ? 'When a client books one of your gigs it will show up here.' : 'Browse gigs and book your first freelancer.'}
        emptyAction={
          <Link className="btn btn-primary" to={isFreelancer ? '/my-gigs' : '/gigs'}>
            {isFreelancer ? 'Manage my gigs' : 'Explore gigs'}
          </Link>
        }
      >
        <ul className="rows" aria-label="Bookings">
          {bookings.map((b) => {
            const escrowLabel = (isFreelancer ? ESCROW_LABEL_FREELANCER : ESCROW_LABEL)[b.escrowStatus];
            const awaitingClientAction = !isFreelancer && b.escrowStatus === 'awaiting_review';
            // Rating comes last: only once the money side is actually settled (paid out, or refunded
            // after a dispute) - not the moment the freelancer marks the work done. See bookingController
            // .reviewBooking on the backend, which enforces the exact same rule.
            const canRate = !isFreelancer && b.status === 'completed' && ['released', 'refunded'].includes(b.escrowStatus);
            return (
              <li key={b.id} className="row">
                <div className="row-main">
                  <h3>
                    <Link to={`/gigs/${b.gig}`}>{decodeEntities(b.gigTitle)}</Link>
                  </h3>
                  <p className="muted">
                    {isFreelancer ? `Client: ${decodeEntities(b.client?.name ?? '')}` : `Freelancer: ${decodeEntities(b.freelancer?.name ?? '')}`} ·{' '}
                    {formatDate(b.createdAt)} · {formatRand(b.price)}
                  </p>
                  {b.notes && <p className="row-note">“{decodeEntities(b.notes)}”</p>}
                  {b.escrowStatus === 'awaiting_review' && b.reviewDeadline && (
                    <p className="muted small">
                      {isFreelancer ? `Funds auto-release ${timeUntil(b.reviewDeadline)} if the client does nothing.` : `Funds auto-release ${timeUntil(b.reviewDeadline)} unless you act.`}
                    </p>
                  )}
                  {b.escrowStatus === 'disputed' && b.disputeReason && (
                    <p className="row-note dispute-note">
                      {isFreelancer ? (
                        <>Client requested a refund: “{decodeEntities(b.disputeReason)}” — an admin will decide whether you’re paid or the client is refunded.</>
                      ) : (
                        <>Your refund request: “{decodeEntities(b.disputeReason)}” — an admin will decide whether the freelancer is paid or you’re refunded.</>
                      )}
                    </p>
                  )}
                </div>
                {b.hasOpenIssue && <StatusPill tone="muted">Issue reported</StatusPill>}
                {escrowLabel && <StatusPill tone={ESCROW_TONE[b.escrowStatus]}>{escrowLabel}</StatusPill>}
                <StatusPill tone={b.status === 'completed' ? 'good' : 'info'}>{b.status === 'completed' ? 'Completed' : 'Confirmed'}</StatusPill>
                <div className="row-actions">
                  {isFreelancer && b.status === 'confirmed' && (
                    <button type="button" className="btn btn-quiet" onClick={() => complete(b.id)}>
                      Mark completed
                    </button>
                  )}
                  {canRate && b.reviewed && <StatusPill tone="good">Reviewed</StatusPill>}
                  {canRate && !b.reviewed && reviewing !== b.id && (
                    <button type="button" className="btn btn-primary" onClick={() => setReviewing(b.id)}>
                      Rate experience
                    </button>
                  )}
                  {awaitingClientAction && disputing !== b.id && (
                    <>
                      <button type="button" className="btn btn-primary" onClick={() => release(b.id)} disabled={releasing === b.id}>
                        {releasing === b.id ? 'Paying…' : 'Pay'}
                      </button>
                      <button type="button" className="btn btn-quiet" onClick={() => setDisputing(b.id)}>
                        Ask for refund
                      </button>
                    </>
                  )}
                  {/* Follow up / Report an issue only make sense before the pay-or-refund decision is
                      reached, or once it's already settled - while awaiting the client's own review,
                      "Pay" and "Ask for refund" above are deliberately the only two choices on offer. */}
                  {!awaitingClientAction && b.escrowStatus !== 'disputed' && (
                    <>
                      <Link className="btn btn-quiet" to={followUpLink(b)}>
                        Follow up
                      </Link>
                      <button type="button" className="btn btn-quiet" onClick={() => toggleIssue(b)} disabled={togglingIssue === b.id}>
                        {togglingIssue === b.id ? 'Saving…' : b.hasOpenIssue ? 'Issue resolved' : 'Report an issue'}
                      </button>
                    </>
                  )}
                </div>
                {reviewing === b.id && (
                  <div className="row-extra">
                    <ReviewForm
                      bookingId={b.id}
                      onCancel={() => setReviewing(null)}
                      onDone={() => {
                        setReviewing(null);
                        toast('Thank you for your review.');
                        reload();
                      }}
                    />
                  </div>
                )}
                {disputing === b.id && (
                  <div className="row-extra">
                    <DisputeForm
                      bookingId={b.id}
                      onCancel={() => setDisputing(null)}
                      onDone={() => {
                        setDisputing(null);
                        toast("Refund requested. We've let the freelancer and our team know.");
                        reload();
                      }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </DataState>
    </>
  );
}
