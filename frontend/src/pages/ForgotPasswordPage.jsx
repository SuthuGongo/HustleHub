import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as api from '../api/hustlehub';
import Alert from '../components/Alert';
import AuthShell from '../components/AuthShell';
import { TextField } from '../components/Fields';
import { validateEmail } from '../utils/validation';
import { useTitle } from '../utils/useTitle';

// Step one of account recovery: ask for the email. The response is deliberately the same whether
// or not that email is registered, so the UI here can't (and doesn't try to) tell the person which
// case happened - it always moves on to the "enter your code" page next.
export default function ForgotPasswordPage() {
  useTitle('Forgot your password');
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const found = validateEmail(email);
    setError(found.email || '');
    setServerError('');
    if (found.email) return;

    setBusy(true);
    try {
      await api.forgotPassword(email.trim());
      navigate('/reset-password', { state: { email: email.trim() } });
    } catch (err) {
      setServerError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Forgot your password?">
      <form className="form" onSubmit={submit} noValidate aria-label="Forgot your password">
        <p className="auth-forgot-intro">Enter your email and, if you have an account, we'll send you a code to reset your password.</p>
        <Alert>{serverError}</Alert>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError('');
          }}
          error={error}
        />
        <button type="submit" className="btn btn-primary btn-wide" disabled={busy}>
          {busy ? 'Sending…' : 'Send reset code'}
        </button>
        <p className="auth-forgot">
          <Link to="/login">Back to login</Link>
        </p>
      </form>
    </AuthShell>
  );
}
