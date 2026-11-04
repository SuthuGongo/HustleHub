// The JWT lives in sessionStorage: it survives a page refresh but is discarded when the tab is closed,
// and is never written to localStorage or a cookie. If storage is unavailable we fall back to memory.
const KEY = 'hustlehub.token';
let memoryToken = null;

export const tokenStore = {
  get() {
    try {
      return window.sessionStorage.getItem(KEY) ?? memoryToken;
    } catch {
      return memoryToken;
    }
  },
  set(token) {
    memoryToken = token;
    try {
      window.sessionStorage.setItem(KEY, token);
    } catch {
      /* storage blocked: memory copy is enough for this tab */
    }
  },
  clear() {
    memoryToken = null;
    try {
      window.sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};
