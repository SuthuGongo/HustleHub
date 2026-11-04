import DataState from '../components/DataState';
import StatusPill from '../components/StatusPill';
import TaxEstimate from '../components/TaxEstimate';
import * as api from '../api/hustlehub';
import { formatDate, formatRand, pluralise } from '../utils/format';
import { decodeEntities } from '../utils/text';
import { useAsync, useCountUp } from '../utils/useAsync';
import { useTitle } from '../utils/useTitle';

export default function IncomePage() {
  useTitle('Income');
  const { data, loading, error, errorStatus, reload } = useAsync(() => api.getIncome());
  const shownTotal = useCountUp(data?.totalEarned ?? 0);

  return (
    <>
      <header className="page-head">
        <h1>Income</h1>
        <p className="muted">What your bookings have earned, and an estimate of what you'd owe in tax on it.</p>
      </header>

      <DataState loading={loading} error={error} errorStatus={errorStatus} onRetry={reload}>
        {data && (
          <>
            <dl className="ledger" aria-label="Income summary">
              <div>
                <dt>Total earned</dt>
                <dd className="ledger-total">{formatRand(shownTotal)}</dd>
              </div>
              <div>
                <dt>Paid bookings</dt>
                <dd>{data.transactionCount}</dd>
              </div>
              <div>
                <dt>Average per booking</dt>
                <dd>{formatRand(data.averagePerBooking)}</dd>
              </div>
              {data.refundedCount > 0 && (
                <div>
                  <dt>Refunded to clients</dt>
                  <dd>{formatRand(data.refundedTotal)}</dd>
                </div>
              )}
            </dl>

            {data.tax && <TaxEstimate tax={data.tax} />}

            <section aria-labelledby="recent-title" className="section">
              <h2 id="recent-title">Recent payments</h2>
              {data.recentTransactions.length === 0 ? (
                <div className="empty">
                  <h2>No income yet</h2>
                  <p>Once a client books one of your gigs, the payment appears here.</p>
                </div>
              ) : (
                <ul className="rows">
                  {data.recentTransactions.map((t) => (
                    <li key={t.id} className="row">
                      <div className="row-main">
                        <h3>{decodeEntities(t.gigTitle)}</h3>
                        <p className="muted">
                          From {decodeEntities(t.client?.name ?? '')} · {formatDate(t.createdAt)} · {t.reference}
                        </p>
                      </div>
                      {t.status === 'refunded' ? (
                        <span className="row-side">
                          <StatusPill tone="danger">Refunded</StatusPill>
                          <s className="amount muted">{formatRand(t.amount)}</s>
                        </span>
                      ) : (
                        <strong className="amount">{formatRand(t.amount)}</strong>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="muted small">Showing your latest {pluralise(data.recentTransactions.length, 'payment')}.</p>
            </section>
          </>
        )}
      </DataState>
    </>
  );
}
