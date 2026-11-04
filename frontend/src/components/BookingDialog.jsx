import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from './Alert';
import PaymentFields from './PaymentFields';
import { TextAreaField } from './Fields';
import * as api from '../api/hustlehub';
import { formatRand } from '../utils/format';
import { decodeEntities } from '../utils/text';
import { validateBookingNotes } from '../utils/validation';
import { validateCardNumber, validateExpiry, validateCvc, validateCardholderName, TEST_CARD } from '../utils/card';

const STEPS = { REVIEW: 'review', PAY: 'pay', VERIFYING: 'verifying', DONE: 'done' };

// A brief "checking this with the bank" pause after Pay, so the demo payment feels real instead of
// resolving instantly. Kept short on purpose - it's a beat, not a real verification.
const VERIFY_MS = 550;
// How long the "payment approved" screen stays up before we hand the client off to Messages.
const REDIRECT_MS = 1700;

// Books the gig and simulates payment in one dialog: review the order, "enter" demo card details
// (never sent anywhere), a short "verifying" pause, then a success screen. The server always
// creates the booking and its Transaction together (see backend/src/controllers/bookingController.js)
// - the card form only gates the "Pay" button in the UI, so the demo feels like a real checkout
// without needing one.
export default function BookingDialog({ gig, onClose }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(STEPS.REVIEW);
  const [notes, setNotes] = useState('');
  const [card, setCard] = useState({ number: TEST_CARD, name: '', expiry: '', cvc: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState(null);
  // Whether we managed to open a conversation with the freelancer to hand the client off to. If that
  // fails for any reason, we fall back to the plain "you're done" screen instead of a broken redirect.
  const [redirecting, setRedirecting] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const dialogRef = useRef(null);

  const title = decodeEntities(gig.title);
  const freelancerName = decodeEntities(gig.freelancer?.name ?? 'the freelancer');
  const notesError = validateBookingNotes(notes);
  const cardValid =
    !validateCardNumber(card.number) && !validateExpiry(card.expiry) && !validateCvc(card.cvc) && !validateCardholderName(card.name);

  useEffect(() => {
    dialogRef.current?.focus();
  }, [step]);

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const goToPayment = () => {
    if (notesError) return;
    setError('');
    setStep(STEPS.PAY);
  };

  const pay = async () => {
    if (!cardValid) return;
    setError('');
    setBusy(true);
    try {
      const { data } = await api.createBooking({ gigId: gig.id, notes: notes.trim() });
      setBooking(data.booking);
      setStep(STEPS.VERIFYING);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  // Once the (simulated) payment is in, pause for a beat as if we're confirming it with the bank,
  // then start (or reopen) a conversation with the freelancer so we can hand the client off to it.
  useEffect(() => {
    if (step !== STEPS.VERIFYING) return undefined;
    let cancelled = false;

    (async () => {
      await new Promise((resolve) => setTimeout(resolve, VERIFY_MS));
      if (cancelled) return;

      let newConversationId = null;
      try {
        const { data } = await api.startConversation(gig.id);
        newConversationId = data.conversation.id;
      } catch {
        newConversationId = null; // couldn't open it automatically - the client can still message from the gig page
      }
      if (cancelled) return;

      setConversationId(newConversationId);
      setRedirecting(Boolean(newConversationId));
      setStep(STEPS.DONE);
      if (!newConversationId) setBusy(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [step, gig.id]);

  // Separate from the effect above so that moving on to STEPS.DONE (set by that same effect) doesn't
  // cancel this one - it holds the approved screen up for a moment, then hands off to the conversation.
  useEffect(() => {
    if (step !== STEPS.DONE || !conversationId) return undefined;
    let cancelled = false;

    (async () => {
      await new Promise((resolve) => setTimeout(resolve, REDIRECT_MS));
      if (cancelled) return;
      navigate(`/messages/${conversationId}`, { state: { justPaid: true, gigTitle: title } });
    })();

    return () => {
      cancelled = true;
    };
  }, [step, conversationId, navigate, title]);

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="booking-title" tabIndex={-1} ref={dialogRef}>
        <h2 id="booking-title">Book “{title}”</h2>
        <p className="dialog-price">{formatRand(gig.price)}</p>

        {step === STEPS.REVIEW && (
          <>
            <p className="muted">
              Delivered in {gig.deliveryDays} {gig.deliveryDays === 1 ? 'day' : 'days'}. Next you'll enter (simulated) card
              details to confirm the booking - no real payment is taken.
            </p>
            <TextAreaField
              label="Notes for the freelancer (optional)"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              error={notesError}
              hint="Deadlines, links or anything they should know. Up to 1000 characters."
            />
            <div className="form-actions">
              <button type="button" className="btn btn-primary" onClick={goToPayment} disabled={Boolean(notesError)}>
                Continue to payment
              </button>
              <button type="button" className="btn btn-quiet" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}

        {step === STEPS.PAY && (
          <>
            <PaymentFields values={card} onChange={setCard} disabled={busy} />
            <Alert>{error}</Alert>
            <div className="form-actions">
              <button type="button" className="btn btn-primary" onClick={pay} disabled={!cardValid || busy}>
                {busy ? 'Processing…' : `Pay ${formatRand(gig.price)}`}
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setStep(STEPS.REVIEW)} disabled={busy}>
                Back
              </button>
            </div>
          </>
        )}

        {step === STEPS.VERIFYING && (
          <div className="dialog-verifying" role="status" aria-live="polite">
            <span className="spinner-ring" aria-hidden="true" />
            <p>Verifying your payment…</p>
            <p className="muted small">Hang tight, we're just confirming this with the bank.</p>
          </div>
        )}

        {step === STEPS.DONE && booking && (
          <>
            <Alert kind="success">
              Payment confirmed for {formatRand(booking.price)}.{' '}
              {redirecting ? `Taking you to your conversation with ${freelancerName}…` : 'Your booking is now paid and confirmed.'}
            </Alert>
            {!redirecting && (
              <div className="form-actions">
                <button type="button" className="btn btn-primary" onClick={onClose}>
                  Done
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
