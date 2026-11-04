import { useState } from 'react';

const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8L12 2.5z';

function StarRow() {
  return (
    <span className="stars-row" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 24 24" width="16" height="16">
          <path d={STAR_PATH} />
        </svg>
      ))}
    </span>
  );
}

// Read-only stars, filled to the nearest half. (Fill width comes from a class, so no inline styles are needed.)
export function Stars({ value = 0, count, showValue = true, className = '' }) {
  const half = Math.max(0, Math.min(10, Math.round(Number(value) * 2)));
  const label = count === 0 || !value ? 'No ratings yet' : `Rated ${Number(value).toFixed(1)} out of 5`;
  const ariaLabel = count !== undefined && count > 0 ? `${label}, ${count} review${count === 1 ? '' : 's'}` : label;

  // Nobody has rated yet: say "New" in words and draw no stars at all, rather than a row of empty ones.
  if (!value) {
    return (
      <span className={`rating ${className}`} role="img" aria-label={ariaLabel}>
        <span className="rating-count">New</span>
      </span>
    );
  }

  return (
    <span className={`rating ${className}`} role="img" aria-label={ariaLabel}>
      <span className="stars" aria-hidden="true">
        <StarRow />
        <span className={`stars-fill r${half}`}>
          <StarRow />
        </span>
      </span>
      {showValue && value > 0 && <strong className="rating-value">{Number(value).toFixed(1)}</strong>}
      {count !== undefined && <span className="rating-count">{count > 0 ? `(${count})` : 'New'}</span>}
    </span>
  );
}

const WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

// Pick 1 to 5 stars. Behaves as a radio group for keyboards and screen readers.
export function StarInput({ value, onChange, label = 'Your rating' }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="star-input">
      <div role="radiogroup" aria-label={label} className="star-input-row" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}: ${WORDS[n]}`}
            className={`star-btn${n <= shown ? ' on' : ''}`}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
          >
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
              <path d={STAR_PATH} />
            </svg>
          </button>
        ))}
      </div>
      <span className="star-word" aria-live="polite">
        {WORDS[shown] || 'Choose a rating'}
      </span>
    </div>
  );
}
