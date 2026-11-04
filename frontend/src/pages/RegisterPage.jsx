import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../api/hustlehub';
import Alert from '../components/Alert';
import AuthShell from '../components/AuthShell';
import CodeStep from '../components/CodeStep';
import { TextField } from '../components/Fields';
import { useAuth } from '../context/AuthContext';
import { resolveHomeAfterAuth } from '../utils/constants';
import { validateRegister } from '../utils/validation';
import { useTitle } from '../utils/useTitle';

const ROLE_CHOICES = [
  { value: 'client', title: 'I want to hire', text: 'Browse gigs and book freelancers.' },
  { value: 'freelancer', title: 'I want to offer services', text: 'List gigs and track what you earn.' },
];

export default function RegisterPage() {
  useTitle('Create your account');
  const { user, register, completeVerification } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // The landing page's "Start hiring" / "Start selling" buttons link here with ?role=... to pre-select an account type.
  const [params] = useSearchParams();
  const requestedRole = ROLE_CHOICES.some((r) => r.value === params.get('role')) ? params.get('role') : 'client';
  const [values, setValues] = useState({ name: '', email: '', password: '', role: requestedRole });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // the { verifyToken, maskedEmail, devCode } step every new account goes through

  // Gated on `!pending` for the same reason as LoginPage: without it, the success check inside
  // CodeStep would never get a moment on screen (see CodeStep.jsx).
  if (user && !pending) return <Navigate to={resolveHomeAfterAuth(location.state?.from, user.role)} replace />;

  const change = (field) => (event) => {
    setValues((v) => ({ ...v, [field]: event.target.value }));
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  };

  const submit = async (event) => {
    event.preventDefault();
    const found = validateRegister(values);
    setErrors(found);
    setServerError('');
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const outcome = await register({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
        role: values.role,
      });
      // Every new account starts unverified, so this is always the 'verify' step in practice - but
      // branching the same way login() does keeps both pages consistent and future-proof.
      if (outcome.status === 'ok') {
        navigate(resolveHomeAfterAuth(location.state?.from, outcome.user.role), { replace: true });
        return;
      }
      setPending(outcome);
      setBusy(false);
    } catch (err) {
      setServerError(err.message);
      setBusy(false);
    }
  };

  if (pending) {
    return (
      <AuthShell title="Check your email">
        <CodeStep
          title="Verify your email"
          maskedEmail={pending.maskedEmail}
          devCode={pending.devCode}
          onVerify={({ code }) => completeVerification(pending.verifyToken, code)}
          onSuccess={() => setPending(null)}
          successMessage="Email verified!"
          onResend={async () => {
            const result = await api.resendEmailVerification(pending.verifyToken);
            setPending((p) => ({ ...p, devCode: result.data?.devCode }));
            return result;
          }}
          onCancel={() => setPending(null)}
          cancelLabel="Back"
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      switchPrompt="Already registered?"
      switchLabel="Log in"
      switchTo="/login"
    >
      <form className="form" onSubmit={submit} noValidate aria-label="Create account">
        <Alert>{serverError}</Alert>

        <fieldset className="role-choice">
          <legend>What brings you here?</legend>
          {ROLE_CHOICES.map((choice) => (
            <label key={choice.value} className={`role-option${values.role === choice.value ? ' selected' : ''}`}>
              <input type="radio" name="role" value={choice.value} checked={values.role === choice.value} onChange={change('role')} />
              <span className="role-title">{choice.title}</span>
              <span className="role-text">{choice.text}</span>
            </label>
          ))}
          {errors.role && <p className="field-error">{errors.role}</p>}
        </fieldset>

        <TextField label="Full name" autoComplete="name" value={values.name} onChange={change('name')} error={errors.name} />
        <TextField label="Email" type="email" autoComplete="email" value={values.email} onChange={change('email')} error={errors.email} />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={change('password')}
          error={errors.password}
          hint="At least 8 characters, with one number and one uppercase letter."
        />
        <button type="submit" className="btn btn-primary btn-wide" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
}
