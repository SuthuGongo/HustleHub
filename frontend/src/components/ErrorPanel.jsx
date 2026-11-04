// What people see when data cannot be loaded. The wording depends on what actually went wrong,
// and there is always a way forward (Try again) rather than a dead end.
export function describeError(message, status) {
  if (status === 0) {
    return { title: "We can't reach the server", text: 'Check your internet connection, then try again.' };
  }
  if (status === 429) {
    return { title: 'Too many requests', text: message || 'Please wait a little while and try again.' };
  }
  if (status >= 500) {
    return { title: 'Something went wrong on our side', text: 'This is not your fault. Please try again in a moment.' };
  }
  return { title: "We couldn't load this", text: message };
}

export default function ErrorPanel({ message, status, onRetry }) {
  const { title, text } = describeError(message, status);
  return (
    <div className="error-panel" role="alert">
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {onRetry && (
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
