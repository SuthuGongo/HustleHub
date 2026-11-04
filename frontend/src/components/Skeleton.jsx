// Placeholder shapes shown while data loads, so the page keeps its layout instead of flashing "Loading…".
export function GigGridSkeleton({ count = 6 }) {
  return (
    <ul className="gig-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <div className="gig-card skeleton-card">
            <div className="skel skel-cover" />
            <div className="skel skel-line skel-w40" />
            <div className="skel skel-line skel-w80" />
            <div className="skel skel-line skel-w60" />
            <div className="skel skel-line skel-w90" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TextSkeleton({ lines = 4 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`skel skel-line ${i === lines - 1 ? 'skel-w60' : 'skel-w90'}`} />
      ))}
    </div>
  );
}
