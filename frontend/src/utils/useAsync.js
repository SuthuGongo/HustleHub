import { useCallback, useEffect, useState } from 'react';

// Runs an async loader on mount (and whenever the deps change) and exposes { data, loading, error, errorStatus, reload }.
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: '', errorStatus: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: '' }));
    loader()
      .then((response) => !cancelled && setState({ data: response.data, loading: false, error: '', errorStatus: null }))
      .catch((err) => !cancelled && setState({ data: null, loading: false, error: err.message, errorStatus: err.status ?? null }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

export function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

// Counts a number up from zero (used for the income total). Jumps straight to the value when the person
// prefers reduced motion, or when animation frames are unavailable.
export function useCountUp(target, durationMs = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const reduced = typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof requestAnimationFrame !== 'function' || !target) {
      setValue(target);
      return undefined;
    }
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setValue(target * (1 - (1 - progress) ** 3)); // ease-out
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return value;
}
