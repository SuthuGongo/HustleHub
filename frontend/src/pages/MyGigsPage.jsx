import { useState } from 'react';
import { useToast } from '../components/Toast';
import { useTitle } from '../utils/useTitle';
import Alert from '../components/Alert';
import DataState from '../components/DataState';
import GigForm from '../components/GigForm';
import StatusPill from '../components/StatusPill';
import * as api from '../api/hustlehub';
import { categoryLabel } from '../utils/constants';
import { formatRand, pluralise } from '../utils/format';
import { decodeEntities } from '../utils/text';
import { useAsync } from '../utils/useAsync';

export default function MyGigsPage() {
  const { data, loading, error, errorStatus, reload } = useAsync(() => api.listMyGigs());
  const [editing, setEditing] = useState(null); // null | 'new' | gig
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const toast = useToast();
  useTitle('My gigs');
  const [actionError, setActionError] = useState('');

  const gigs = data?.gigs ?? [];

  const run = async (action, successMessage) => {
    setActionError('');
    try {
      await action();
      toast(successMessage);
      reload();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const save = async (values) => {
    setBusy(true);
    setFormError('');
    try {
      if (editing === 'new') await api.createGig(values);
      else await api.updateGig(editing.id, values);
      toast(editing === 'new' ? 'Gig created.' : 'Gig updated.');
      setEditing(null);
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toFormValues = (gig) => ({
    title: decodeEntities(gig.title),
    description: decodeEntities(gig.description),
    category: gig.category,
    price: String(gig.price),
    deliveryDays: String(gig.deliveryDays),
  });

  return (
    <>
      <header className="page-head page-head-row">
        <div>
          <h1>My gigs</h1>
          <p className="muted">Create, edit and pause the services you offer.</p>
        </div>
        {!editing && (
          <button type="button" className="btn btn-primary" onClick={() => { setEditing('new'); setFormError('');  }}>
            Create a gig
          </button>
        )}
      </header>

      <Alert>{actionError}</Alert>

      {editing && (
        <section className="panel" aria-labelledby="gig-form-title">
          <h2 id="gig-form-title">{editing === 'new' ? 'New gig' : 'Edit gig'}</h2>
          <GigForm
            key={editing === 'new' ? 'new' : editing.id}
            initial={editing === 'new' ? undefined : toFormValues(editing)}
            submitLabel={editing === 'new' ? 'Create gig' : 'Save changes'}
            busy={busy}
            serverError={formError}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        </section>
      )}

      <DataState
        loading={loading && !data}
        error={error} errorStatus={errorStatus} onRetry={reload}
        empty={!loading && gigs.length === 0 && !editing}
        emptyTitle="You haven't created a gig yet"
        emptyText="Create your first gig so clients can find and book you."
        emptyAction={
          <button type="button" className="btn btn-primary" onClick={() => { setEditing('new'); setFormError(''); }}>
            Create your first gig
          </button>
        }
      >
        <ul className="rows" aria-label="My gigs">
          {gigs.map((gig) => (
            <li key={gig.id} className="row">
              <div className="row-main">
                <h3>{decodeEntities(gig.title)}</h3>
                <p className="muted">
                  {categoryLabel(gig.category)} · {formatRand(gig.price)} · {pluralise(gig.deliveryDays, 'day')}
                </p>
              </div>
              <StatusPill tone={gig.isActive ? 'good' : 'muted'}>{gig.isActive ? 'Live' : 'Paused'}</StatusPill>
              <div className="row-actions">
                <button type="button" className="btn btn-quiet" onClick={() => { setEditing(gig); setFormError('');  }}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => run(() => api.updateGig(gig.id, { isActive: !gig.isActive }), gig.isActive ? 'Gig paused.' : 'Gig is live again.')}
                >
                  {gig.isActive ? 'Pause' : 'Make live'}
                </button>
                {confirmDeleteId === gig.id ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => { setConfirmDeleteId(null); run(() => api.deleteGig(gig.id), 'Gig deleted.'); }}
                    >
                      Confirm delete
                    </button>
                    <button type="button" className="btn btn-quiet" onClick={() => setConfirmDeleteId(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn-quiet" onClick={() => setConfirmDeleteId(gig.id)}>
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </DataState>
    </>
  );
}
