import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { tokenStore } from '../utils/tokenStore';

// jsdom does not implement scrollIntoView at all (it has no real layout engine to scroll), so any
// component that calls it - MessagesPage's auto-scroll-to-latest-message being the first one - would
// otherwise crash every test that renders it. A no-op stub is enough: no test in this suite asserts
// on scroll position, only on what content is present.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  tokenStore.clear(); // the store keeps an in-memory copy too; never let a session leak between tests
});
