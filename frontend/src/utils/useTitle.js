import { useEffect } from 'react';

// Sets the browser tab title for the current page ("Explore gigs · HustleHub+").
export function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · HustleHub+` : 'HustleHub+';
  }, [title]);
}
