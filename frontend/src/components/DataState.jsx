import ErrorPanel from './ErrorPanel';

// Shared loading / error / empty handling so every page treats those moments the same way.
// `skeleton` shows placeholder shapes while loading; `onRetry` adds a "Try again" button to errors;
// `emptyAction` puts a sensible next step (a link or button) under an empty-state message.
export default function DataState({ loading, error, errorStatus, onRetry, empty, emptyTitle, emptyText, emptyAction, skeleton, children }) {
  if (loading) {
    if (skeleton) {
      return (
        <>
          {skeleton}
          <span className="sr-only" role="status">
            Loading…
          </span>
        </>
      );
    }
    return (
      <p className="page-status" role="status">
        Loading…
      </p>
    );
  }
  if (error) return <ErrorPanel message={error} status={errorStatus} onRetry={onRetry} />;
  if (empty) {
    return (
      <div className="empty">
        <h2>{emptyTitle}</h2>
        {emptyText && <p>{emptyText}</p>}
        {emptyAction && <div className="empty-action">{emptyAction}</div>}
      </div>
    );
  }
  return children;
}
