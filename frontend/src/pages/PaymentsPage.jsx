import { Link } from 'react-router-dom';
import DataState from '../components/DataState';
import StatusPill from '../components/StatusPill';
import * as api from '../api/hustlehub';
import { formatDate, formatRand } from '../utils/format';
import { decodeEntities } from '../utils/text';
import { useAsync } from '../utils/useAsync';
import { useTitle } from '../utils/useTitle';

export default function PaymentsPage() {
  useTitle('Payments');
  const { data, loading, error, errorStatus, reload } = useAsync(() => api.listTransactions());
  const transactions = data?.transactions ?? [];

  return (
    <>
      <header className="page-head">
        <h1>Payments</h1>
        <p className="muted">A record of every (simulated) payment you have made.</p>
      </header>
      <DataState
        loading={loading}
        error={error} errorStatus={errorStatus} onRetry={reload}
        empty={transactions.length === 0}
        emptyTitle="No payments yet"
        emptyText="Book a gig and the payment record will appear here."
        emptyAction={
          <Link className="btn btn-primary" to="/gigs">
            Explore gigs
          </Link>
        }
      >
        <ul className="rows" aria-label="Payments">
          {transactions.map((t) => (
            <li key={t.id} className="row">
              <div className="row-main">
                <h3>{decodeEntities(t.gigTitle)}</h3>
                <p className="muted">
                  Paid to {decodeEntities(t.freelancer?.name ?? '')} · {formatDate(t.createdAt)} · {t.reference}
                </p>
              </div>
              {t.status === 'refunded' ? (
                <span className="row-side">
                  <StatusPill tone="info">Refunded to you</StatusPill>
                  <strong className="amount">{formatRand(t.amount)}</strong>
                </span>
              ) : (
                <strong className="amount">{formatRand(t.amount)}</strong>
              )}
            </li>
          ))}
        </ul>
      </DataState>
    </>
  );
}
