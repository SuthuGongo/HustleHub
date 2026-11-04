// A labelled horizontal bar per entry, each sized relative to the largest value - used for the
// gigs-by-category and bookings-by-status breakdowns on the admin overview.
export default function BreakdownBars({ data, labelFor, formatValue }) {
  const entries = Object.entries(data);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (entries.length === 0) return <p className="muted small">No data yet.</p>;

  return (
    <ul className={formatValue ? 'breakdown-bars breakdown-bars-wide' : 'breakdown-bars'}>
      {entries.map(([key, value]) => (
        <li key={key}>
          <span className="breakdown-label">{labelFor ? labelFor(key) : key}</span>
          <span className="breakdown-track">
            <span className="breakdown-fill" style={{ width: `${(value / max) * 100}%` }} />
          </span>
          <span className="breakdown-value">{formatValue ? formatValue(value) : value}</span>
        </li>
      ))}
    </ul>
  );
}
