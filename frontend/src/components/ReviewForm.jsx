import { useState } from 'react';
import Alert from './Alert';
import { StarInput } from './StarRating';
import { TextAreaField } from './Fields';
import * as api from '../api/hustlehub';

// Shown under a completed booking so the client can rate the work (once).
export default function ReviewForm({ bookingId, onDone, onCancel }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const commentError = comment.length > 1000 ? 'Comment must be 1000 characters or fewer.' : '';

  const submit = async (event) => {
    event.preventDefault();
    if (!rating) {
      setError('Choose a star rating first.');
      return;
    }
    if (commentError) return;
    setBusy(true);
    setError('');
    try {
      await api.reviewBooking(bookingId, { rating, comment: comment.trim() });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="review-form" onSubmit={submit} noValidate aria-label="Write a review">
      <Alert>{error}</Alert>
      <StarInput value={rating} onChange={(n) => { setRating(n); setError(''); }} />
      <TextAreaField
        label="Tell others about the work (optional)"
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        error={commentError}
        hint="What went well? Up to 1000 characters."
      />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit review'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
