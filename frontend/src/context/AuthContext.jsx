import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api/hustlehub';
import { setUnauthorizedHandler } from '../api/client';
import { tokenStore } from '../utils/tokenStore';

const AuthContext = createContext(null);

// login() and register() can each land in one of three places, and every caller needs to branch on
// which one happened rather than assume success:
//   { status: 'ok', user }                                 - a real session was started
//   { status: 'verify', verifyToken, maskedEmail, devCode } - finish by entering the emailed code
//   { status: '2fa', twoFactorToken, maskedEmail, devCode } - finish by entering the 2FA code
function toOutcome(data) {
  if (data.requiresVerification) return { status: 'verify', verifyToken: data.verifyToken, maskedEmail: data.maskedEmail, devCode: data.devCode };
  if (data.requiresTwoFactor) return { status: '2fa', twoFactorToken: data.twoFactorToken, maskedEmail: data.maskedEmail, devCode: data.devCode };
  return { status: 'ok', user: data.user };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [sessionEnded, setSessionEnded] = useState(false); // true when a signed-in session was rejected by the API
  // If a token survived a page refresh we must confirm it with the API before deciding who is logged in.
  const [initialising, setInitialising] = useState(() => Boolean(tokenStore.get()));
  const hadTokenOnLoad = useRef(Boolean(tokenStore.get()));

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  // Any 401 from the API (expired or revoked token) signs the person out, and remembers that it happened
  // so the login page can explain why they were sent there.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
      setSessionEnded(true);
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  useEffect(() => {
    if (!hadTokenOnLoad.current) return undefined;
    let cancelled = false;
    api
      .getMe()
      .then(({ data }) => !cancelled && setUser(data.user))
      .catch(() => !cancelled && logout())
      .finally(() => !cancelled && setInitialising(false));
    return () => {
      cancelled = true;
    };
  }, [logout]);

  // The only place a real session is ever established, from any flow (direct login, email
  // verification, or 2FA) - every one of them ends by handing this a real { user, token } pair.
  const startSession = useCallback(({ data }) => {
    tokenStore.set(data.token);
    setSessionEnded(false);
    setUser(data.user);
    return data.user;
  }, []);

  // The one place login()/register() actually finish: for a direct success ('ok') this is where the
  // session is established (token stored, user set) - NOT left to the caller to infer from the
  // returned outcome. A prior version of this function only returned the outcome and never called
  // startSession for the 'ok' case, so a normal login (no verification or 2FA pending) would appear
  // to succeed - the caller would navigate away - while no session had actually been started, and the
  // very next protected page would bounce the person straight back to login. Caught by a test that
  // exercised a real protected route rather than a public one, which is why it stayed hidden until then.
  const finishAuth = useCallback(
    async (apiCall, payload) => {
      const { data } = await apiCall(payload);
      const outcome = toOutcome(data);
      if (outcome.status === 'ok') startSession({ data });
      return outcome;
    },
    [startSession]
  );

  const login = useCallback((credentials) => finishAuth(api.login, credentials), [finishAuth]);
  const register = useCallback((details) => finishAuth(api.register, details), [finishAuth]);

  // Completes whichever flow login()/register() left pending.
  const completeVerification = useCallback(async (verifyToken, code) => startSession(await api.verifyEmail(verifyToken, code)), [startSession]);
  const completeTwoFactor = useCallback(
    async (twoFactorToken, payload) => startSession(await api.verifyTwoFactorLogin(twoFactorToken, payload)),
    [startSession]
  );

  const value = useMemo(
    () => ({
      user,
      initialising,
      sessionEnded,
      isAuthenticated: Boolean(user),
      login,
      register,
      completeVerification,
      completeTwoFactor,
      logout,
    }),
    [user, initialising, sessionEnded, login, register, completeVerification, completeTwoFactor, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}

export { AuthContext };
