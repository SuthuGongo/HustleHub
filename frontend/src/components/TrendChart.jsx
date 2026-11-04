// A small, dependency-free bar chart: each day in the trend is one bar, height scaled to the
// largest value in the set. Plain SVG so it renders identically everywhere, with no chart library.
export default function TrendChart({ points, valueKey = 'total', labelKey = 'date', formatValue, height = 120, ariaLabel = 'Trend over the last 14 days', emptyText = 'No transactions in this period yet.', showAllLabels = false }) {
  const total = points.reduce((sum, p) => sum + p[valueKey], 0);
  if (total === 0) {
    return <p className="muted small">{emptyText}</p>;
  }
  const max = Math.max(1, ...points.map((p) => p[valueKey]));
  const barWidth = 100 / points.length;

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label={ariaLabel}>
        {points.map((p, i) => {
          const value = p[valueKey];
          const barHeight = (value / max) * (height - 4);
          return (
            <rect
              key={p[labelKey]}
              x={i * barWidth + barWidth * 0.15}
              y={height - barHeight}
              width={barWidth * 0.7}
              height={Math.max(barHeight, value > 0 ? 2 : 0)}
              rx="1"
              className="trend-bar"
            >
              <title>
                {p[labelKey]}: {formatValue ? formatValue(value) : value}
              </title>
            </rect>
          );
        })}
      </svg>
      <div className="trend-chart-labels muted small">
        {showAllLabels ? (
          points.map((p) => <span key={p[labelKey]}>{p[labelKey]}</span>)
        ) : (
          <>
            <span>{points[0]?.[labelKey]}</span>
            <span>{points[points.length - 1]?.[labelKey]}</span>
          </>
        )}
      </div>
    </div>
  );
}
