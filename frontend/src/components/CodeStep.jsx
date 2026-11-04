import { useEffect, useState } from 'react';
import Alert from './Alert';
import CodeBoxes from './CodeBoxes';
import { TextField } from './Fields';

const SUCCESS_PAUSE_MS = 1100; // long enough to register as a deliberate confirmation, short enough not to feel like a delay

// The "enter the 6-digit code we emailed you" step, shared by finishing registration, logging in
// to an unverified account, 2FA login, and turning 2FA on - everywhere a one-time email code is
// checked. Shows the demo code inline when devCode is present (no SMTP configured), exactly as the
// payment step shows a test card: the feature stays fully usable and honest about being a demo.
//
// On a correct code, the whole form is replaced by a green check and a confirmation message; only
// once that has been shown for a moment does this call onSuccess(), which is where the caller should
// do whatever comes next (navigate away, reveal backup codes, etc). onVerify itself still resolves
// (and, for login/registration, still starts the real session) the instant the code is confirmed -
// this only delays the VISUAL handoff, never the actual security state.
export default function CodeStep({
  title,
  maskedEmail,
  devCode,
  onVerify,
  onSuccess,
  successMessage = 'Verified!',
  onResend,
  allowBackupCode = false,
  onCancel,
  cancelLabel = 'Use a different account',
}) {
  const [code, setCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [usingBackup, setUsingBackup] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resendState, setResendState] = useState({ busy: false, message: '', cooldown: 0 });

  // Counts the cooldown down to zero, one second at a time, so "Resend in 45s" becomes "Resend in 44s"
  // and the button re-enables itself the moment it reaches 0, with no need to retry to find out.
  useEffect(() => {
    if (resendState.cooldown <= 0) return undefined;
    const timer = setInterval(() => setResendState((s) => ({ ...s, cooldown: Math.max(0, s.cooldown - 1) })), 1000);
    return () => clearInterval(timer);
  }, [resendState.cooldown > 0]);

  // Holds the success screen up for a moment, then hands off to the caller - see the note above.
  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => onSuccess?.(), SUCCESS_PAUSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onVerify(usingBackup ? { backupCode: backupCode.trim() } : { code: code.trim() });
      setSuccess(true);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const resend = async () => {
    setResendState({ busy: true, message: '', cooldown: 0 });
    try {
      const result = await onResend();
      setResendState({ busy: false, message: result?.message || 'A new code has been sent.', cooldown: 0 });
    } catch (err) {
      setResendState({ busy: false, message: err.message, cooldown: err.retryAfterSeconds || 0 });
    }
  };

  if (success) {
    return (
      <div className="code-step-success" role="status" aria-label={successMessage}>
        <svg className="code-step-success-tick" viewBox="0 0 52 52" aria-hidden="true">
          <circle className="code-step-success-circle" cx="26" cy="26" r="24" />
          <path className="code-step-success-check" d="M14 27l8 8 16-16" />
        </svg>
        <p>{successMessage}</p>
      </div>
    );
  }

  return (
    <form className="form code-step" onSubmit={submit} noValidate aria-label={title}>
      <p className="code-step-intro">
        {maskedEmail ? (
          <>
            Enter the 6-digit code we sent to <strong>{maskedEmail}</strong>.
          </>
        ) : (
          'Enter the 6-digit code we sent to your email.'
        )}
      </p>

      {devCode && (
        <Alert kind="info">
          Demo mode: no email account is configured, so here is the code instead of an inbox: <strong>{devCode}</strong>
        </Alert>
      )}

      <Alert>{error}</Alert>

      {!usingBackup ? (
        <CodeBoxes
          label="Verification code"
          value={code}
          disabled={busy}
          onChange={(next) => {
            setCode(next);
            setError('');
          }}
        />
      ) : (
        <TextField
          label="Backup code"
          autoComplete="off"
          value={backupCode}
          onChange={(e) => {
            setBackupCode(e.target.value.toUpperCase());
            setError('');
          }}
          placeholder="XXXX-XXXX"
          hint="One of the 8 backup codes you saved when you turned on two-factor authentication."
        />
      )}

      <button
        type="submit"
        className="btn btn-primary btn-wide"
        disabled={busy || (usingBackup ? !backupCode.trim() : !/^\d{6}$/.test(code))}
      >
        {busy ? 'Verifying…' : 'Verify'}
      </button>

      <div className="code-step-actions">
        {!usingBackup && (
          <button type="button" className="btn-link" onClick={resend} disabled={resendState.busy || resendState.cooldown > 0}>
            {resendState.busy ? 'Sending…' : resendState.cooldown > 0 ? `Resend in ${resendState.cooldown}s` : 'Resend code'}
          </button>
        )}
        {allowBackupCode && (
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              setUsingBackup((v) => !v);
              setError('');
            }}
          >
            {usingBackup ? 'Use my email code instead' : "Can't access your email? Use a backup code"}
          </button>
        )}
        {onCancel && (
          <button type="button" className="btn-link" onClick={onCancel}>
            {cancelLabel}
          </button>
        )}
      </div>

      {resendState.message && (
        <p className="code-step-resend-note" role="status">
          {resendState.message}
        </p>
      )}
    </form>
  );
}
