import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import * as api from '../api/hustlehub';
import Alert from '../components/Alert';
import AuthShell from '../components/AuthShell';
import CodeStep from '../components/CodeStep';
import { TextField } from '../components/Fields';
import { useAuth } from '../context/AuthContext';
import { resolveHomeAfterAuth } from '../utils/constants';
import { validateLogin } from '../utils/validation';
import { useTitle } from '../utils/useTitle';

// Why the person was sent to the login page (set by ProtectedRoute).
const NOTICES = {
  'login-required': 'Please log in to continue.',
  expired: 'Your session has ended, so please log in again.',
};

export default function LoginPage() {
  useTitle('Log in');
  const { user, login, completeVerification, completeTwoFactor } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // { status: 'verify' | '2fa', ...outcome } while a code is needed

  // Already signed in (including the moment a pending step completes): go back to where the person
  // came from, else their home page. Gated on `!pending` so the success check + message inside
  // CodeStep actually gets a moment on screen before this fires, instead of unmounting it instantly
  // the moment the session is established (which happens as soon as the code is confirmed, not after
  // the animation - see CodeStep.jsx).
  if (user && !pending) return <Navigate to={resolveHomeAfterAuth(location.state?.from, user.role)} replace />;

  const change = (field) => (event) => {
    setValues((v) => ({ ...v, [field]: event.target.value }));
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  };

  const submit = async (event) => {
    event.preventDefault();
    const found = validateLogin(values);
    setErrors(found);
    setServerError('');
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const outcome = await login({ email: values.email.trim(), password: values.password });
      if (outcome.status === 'ok') {
        navigate(resolveHomeAfterAuth(location.state?.from, outcome.user.role), { replace: true });
        return;
      }
      setPending(outcome); // 'verify' (never finished signing up) or '2fa'
      setBusy(false);
    } catch (err) {
      if (err.status === 403) {
        navigate('/account-disabled', { replace: true }); // the API only answers 403 here for a disabled account
        return;
      }
      setServerError(err.message); // e.g. "Invalid email or password." - deliberately generic
      setBusy(false);
    }
  };

  if (pending?.status === 'verify') {
    return (
      <AuthShell title="Finish signing up">
        <CodeStep
          title="Verify your email"
          maskedEmail={pending.maskedEmail}
          devCode={pending.devCode}
          onVerify={({ code }) => completeVerification(pending.verifyToken, code)}
          onSuccess={() => setPending(null)}
          successMessage="Email verified!"
          onResend={async () => {
            const result = await api.resendEmailVerification(pending.verifyToken);
            setPending((p) => ({ ...p, devCode: result.data?.devCode })); // show the fresh demo code, if any
            return result;
          }}
          onCancel={() => setPending(null)}
          cancelLabel="Back to login"
        />
      </AuthShell>
    );
  }

  if (pending?.status === '2fa') {
    return (
      <AuthShell title="Enter your code">
        <CodeStep
          title="Two-factor verification"
          maskedEmail={pending.maskedEmail}
          devCode={pending.devCode}
          allowBackupCode
          onVerify={(payload) => completeTwoFactor(pending.twoFactorToken, payload)}
          onSuccess={() => setPending(null)}
          successMessage="Verified!"
          onResend={async () => {
            const result = await api.resendTwoFactorCode(pending.twoFactorToken);
            setPending((p) => ({ ...p, devCode: result.data?.devCode }));
            return result;
          }}
          onCancel={() => setPending(null)}
          cancelLabel="Back to login"
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Welcome back"
      switchPrompt="New here?"
      switchLabel="Create an account"
      switchTo="/register"
    >
      <form className="form" onSubmit={submit} noValidate aria-label="Log in">
        <Alert kind="info">{NOTICES[location.state?.notice]}</Alert>
        <Alert>{serverError}</Alert>
        <TextField label="Email" type="email" autoComplete="email" value={values.email} onChange={change('email')} error={errors.email} />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={values.password}
          onChange={change('password')}
          error={errors.password}
        />
        <button type="submit" className="btn btn-primary btn-wide" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
        <p className="auth-forgot">
          <Link to="/forgot-password">Forgot your password?</Link>
        </p>
      </form>
    </AuthShell>
  );
}
