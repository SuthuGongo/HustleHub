import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import * as api from '../api/hustlehub';
import Alert from '../components/Alert';
import AuthShell from '../components/AuthShell';
import { TextField } from '../components/Fields';
import { validateEmail, validateNewPassword } from '../utils/validation';
import { useTitle } from '../utils/useTitle';

// Step two: the code (never handed to this page by the API - the person types it from their email,
// or from the demo notice in dev mode) plus a new password, checked against the account by email.
export default function ResetPasswordPage() {
  useTitle('Reset your password');
  const location = useLocation();
  const [values, setValues] = useState({ email: location.state?.email ?? '', code: '', newPassword: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const change = (field) => (event) => {
    let value = event.target.value;
    if (field === 'code') value = value.replace(/\D/g, '').slice(0, 6);
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  };

  const submit = async (event) => {
    event.preventDefault();
    const found = {
      ...validateEmail(values.email),
      ...(values.code.trim().length === 6 ? {} : { code: 'Enter the 6-digit code from your email.' }),
      ...validateNewPassword(values.newPassword),
    };
    setErrors(found);
    setServerError('');
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      await api.resetPassword({ email: values.email.trim(), code: values.code.trim(), newPassword: values.newPassword });
      setDone(true);
    } catch (err) {
      setServerError(err.message);
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Password changed">
        <p className="auth-forgot-intro">Your password has been changed. You can now log in with it.</p>
        <Link className="btn btn-primary btn-wide" to="/login">
          Go to login
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password">
      <form className="form" onSubmit={submit} noValidate aria-label="Reset your password">
        <p className="auth-forgot-intro">Enter the code we emailed you, along with your new password.</p>
        <Alert>{serverError}</Alert>
        <TextField label="Email" type="email" autoComplete="email" value={values.email} onChange={change('email')} error={errors.email} />
        <TextField
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={values.code}
          onChange={change('code')}
          error={errors.code}
          placeholder="000000"
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={values.newPassword}
          onChange={change('newPassword')}
          error={errors.newPassword}
          hint="At least 8 characters, with one number and one uppercase letter."
        />
        <button type="submit" className="btn btn-primary btn-wide" disabled={busy}>
          {busy ? 'Resetting…' : 'Reset password'}
        </button>
        <p className="auth-forgot">
          <Link to="/forgot-password">Request a new code</Link>
        </p>
      </form>
    </AuthShell>
  );
}
