import { useEffect, useState } from 'react';

// A slim notice while the browser has no connection. It disappears by itself when the connection returns.
export default function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      You're offline. Some things won't work until your connection is back.
    </div>
  );
}
