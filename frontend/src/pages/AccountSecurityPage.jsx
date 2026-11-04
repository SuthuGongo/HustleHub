import { useState } from 'react';
import * as api from '../api/hustlehub';
import Alert from '../components/Alert';
import CodeStep from '../components/CodeStep';
import DataState from '../components/DataState';
import { TextField } from '../components/Fields';
import { useAsync } from '../utils/useAsync';
import { useTitle } from '../utils/useTitle';

// Shown once, right after turning 2FA on: the person's only chance to see (and save) these codes.
function BackupCodesReveal({ codes, onDone }) {
  return (
    <div className="backup-codes" role="group" aria-label="Your backup codes">
      <Alert kind="info">Save these somewhere safe. Each one works once, and lets you in if you ever lose access to your email.</Alert>
      <ul className="backup-codes-list">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <button type="button" className="btn btn-primary" onClick={onDone}>
        I've saved these codes
      </button>
    </div>
  );
}

function EnableFlow({ onEnabled }) {
  const [step, setStep] = useState('start'); // start -> code -> codes
  const [pending, setPending] = useState(null); // { maskedEmail, devCode }
  const [backupCodes, setBackupCodes] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setError('');
    setBusy(true);
    try {
      const { data } = await api.requestEnableTwoFactor();
      setPending({ maskedEmail: data.maskedEmail, devCode: data.devCode });
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (step === 'codes') {
    return (
      <BackupCodesReveal
        codes={backupCodes}
        onDone={() => {
          setStep('start');
          onEnabled();
        }}
      />
    );
  }

  if (step === 'code') {
    return (
      <CodeStep
        title="Confirm two-factor authentication"
        maskedEmail={pending.maskedEmail}
        devCode={pending.devCode}
        onVerify={async ({ code }) => {
          const { data } = await api.confirmEnableTwoFactor(code);
          setBackupCodes(data.backupCodes); // ready and waiting; the step change itself happens in onSuccess
        }}
        onSuccess={() => setStep('codes')}
        successMessage="Two-factor authentication is on!"
        onResend={async () => {
          const result = await api.requestEnableTwoFactor();
          setPending({ maskedEmail: result.data?.maskedEmail, devCode: result.data?.devCode });
          return result;
        }}
        onCancel={() => setStep('start')}
        cancelLabel="Cancel"
      />
    );
  }

  return (
    <>
      <Alert>{error}</Alert>
      <p>Turn on two-factor authentication to require a code from your email every time you log in, on top of your password.</p>
      <button type="button" className="btn btn-primary" onClick={start} disabled={busy}>
        {busy ? 'Sending code…' : 'Turn on two-factor authentication'}
      </button>
    </>
  );
}

function DisableFlow({ onDisabled }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.disableTwoFactor(password);
      onDisabled();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!confirming) {
    return (
      <>
        <p>Two-factor authentication is on. Logging in needs your password and a code from your email.</p>
        <button type="button" className="btn btn-quiet" onClick={() => setConfirming(true)}>
          Turn off two-factor authentication
        </button>
      </>
    );
  }

  return (
    <form className="form" onSubmit={submit} noValidate aria-label="Turn off two-factor authentication">
      <Alert>{error}</Alert>
      <p>Enter your password to confirm you want to turn two-factor authentication off.</p>
      <TextField
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setError('');
        }}
      />
      <div className="form-actions">
        <button type="submit" className="btn btn-danger" disabled={busy || !password}>
          {busy ? 'Turning off…' : 'Turn off two-factor authentication'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setConfirming(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function AccountSecurityPage() {
  useTitle('Security settings');
  const { data, loading, error, errorStatus, reload } = useAsync(() => api.twoFactorStatus());

  return (
    <>
      <header className="page-head">
        <h1>Security settings</h1>
        <p className="muted">Manage how you sign in to HustleHub+.</p>
      </header>

      <section className="panel security-panel" aria-labelledby="twofa-title">
        <h2 id="twofa-title">Two-factor authentication</h2>
        <DataState loading={loading} error={error} errorStatus={errorStatus} onRetry={reload}>
          {data && (data.twoFactorEnabled ? <DisableFlow onDisabled={reload} /> : <EnableFlow onEnabled={reload} />)}
        </DataState>
      </section>
    </>
  );
}
