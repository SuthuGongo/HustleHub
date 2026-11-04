import Avatar from './Avatar';
import { Stars } from './StarRating';
import { formatDate } from '../utils/format';
import { decodeEntities } from '../utils/text';

// Rating summary (average + bars per star) followed by the reviews themselves.
export default function ReviewList({ reviews, summary }) {
  const total = summary?.count ?? 0;

  if (total === 0) {
    return (
      <div className="empty empty-inline">
        <h3>No reviews yet</h3>
        <p>Reviews appear here after a client's booking has been completed.</p>
      </div>
    );
  }

  return (
    <div className="reviews">
      <div className="review-summary">
        <div className="review-score">
          <strong>{summary.average.toFixed(1)}</strong>
          <Stars value={summary.average} showValue={false} />
          <span className="muted small">
            {total} review{total === 1 ? '' : 's'}
          </span>
        </div>
        <ul className="review-bars" aria-label="Ratings breakdown">
          {[5, 4, 3, 2, 1].map((star) => (
            <li key={star}>
              <span>{star} star</span>
              <progress className="bar" value={summary.distribution[star] ?? 0} max={total} aria-label={`${summary.distribution[star] ?? 0} reviews with ${star} stars`} />
              <span className="muted">{summary.distribution[star] ?? 0}</span>
            </li>
          ))}
        </ul>
      </div>

      <ul className="review-list">
        {reviews.map((r) => (
          <li key={r.id} className="review">
            <Avatar name={r.client?.name ?? ''} size="sm" />
            <div>
              <div className="review-head">
                <strong>{decodeEntities(r.client?.name ?? 'Client')}</strong>
                <Stars value={r.rating} showValue={false} />
                <span className="muted small">{formatDate(r.createdAt)}</span>
              </div>
              {r.comment ? <p>{decodeEntities(r.comment)}</p> : <p className="muted">No written comment.</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
