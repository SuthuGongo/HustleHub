import BreakdownBars from './BreakdownBars';
import TrendChart from './TrendChart';
import { formatRand } from '../utils/format';

// "2026-03" -> "Mar". Built from UTC parts so the label never slips a month in a different time zone.
const monthLabel = (key) => {
  const [year, month] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) // en-US gives the 3-letter form ("Sep"); en-ZA gives "Sept";
};

const percent = (rate) => `${Math.round(rate * 1000) / 10}%`; // 0.26 -> "26%"

// Everything on the income page that is about tax: the headline figures, take-home vs tax, how close
// the freelancer is to the tax-free threshold, income month by month, and a step-by-step working of the
// calculation using their own numbers. All figures come from the API (backend/src/utils/tax.js), so the
// explanation on screen can never drift from what is actually calculated.
export default function TaxEstimate({ tax }) {
  const earnings = tax.taxYearEarnings;
  const threshold = tax.taxFreeThreshold;
  const thresholdUsed = threshold ? Math.min(100, Math.round((earnings / threshold) * 100)) : 0;
  const pastThreshold = threshold ? earnings > threshold : false;
  const months = (tax.monthly ?? []).map((m) => ({ date: monthLabel(m.month), total: m.total, count: m.count }));
  const hasWorking = Array.isArray(tax.brackets) && tax.bracketNumber;
  const bracket = hasWorking ? tax.brackets[tax.bracketNumber - 1] : null;

  return (
    <section aria-labelledby="tax-title" className="section">
      <h2 id="tax-title">Estimated tax</h2>
      <p className="muted small">
        Based on {formatRand(earnings)} earned so far in the {tax.taxYearLabel}. This is a simplified estimate for
        planning only, not tax advice: it doesn't account for deductible expenses, provisional tax, or any rebate
        beyond the primary one.
      </p>

      <dl className="ledger" aria-label="Tax estimate">
        <div>
          <dt>Estimated tax owed</dt>
          <dd className="ledger-total">{formatRand(tax.estimatedTax)}</dd>
        </div>
        <div>
          <dt>Estimated take-home</dt>
          <dd>{formatRand(tax.takeHome)}</dd>
        </div>
        <div>
          <dt>Effective rate</dt>
          <dd>{tax.effectiveRate}%</dd>
        </div>
        {tax.marginalRate != null && (
          <div>
            <dt>Tax on your next rand</dt>
            <dd>{percent(tax.marginalRate)}</dd>
          </div>
        )}
      </dl>

      <div className="tax-visuals">
        <div>
          <h3>Take-home vs tax</h3>
          <BreakdownBars
            data={{ takeHome: tax.takeHome, estimatedTax: tax.estimatedTax }}
            labelFor={(key) => (key === 'takeHome' ? 'Take-home' : 'Estimated tax')}
            formatValue={formatRand}
          />
        </div>

        {threshold > 0 && (
          <div className="threshold">
            <h3>Tax-free threshold</h3>
            <span
              className="breakdown-track"
              role="progressbar"
              aria-label="Share of the tax-free threshold used"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={thresholdUsed}
            >
              <span className="breakdown-fill" style={{ width: `${thresholdUsed}%` }} />
            </span>
            <p className="muted small">
              {pastThreshold
                ? `You're past the ${formatRand(threshold)} tax-free threshold, so tax applies to what you earn above the rebate.`
                : `You've used ${thresholdUsed}% of the ${formatRand(threshold)} you can earn in a tax year before any tax is due.`}
            </p>
          </div>
        )}
      </div>

      {months.length > 0 && (
        <div className="tax-month-chart">
          <h3>Income by month</h3>
          <TrendChart
            points={months}
            formatValue={formatRand}
            ariaLabel={`Income by month across the ${tax.taxYearLabel}`}
            emptyText="No income recorded this tax year yet."
            showAllLabels
          />
        </div>
      )}

      {hasWorking && (
        <details className="how-tax">
          <summary>How this estimate is calculated</summary>
          <ol>
            <li>
              <strong>Count your income.</strong> {formatRand(earnings)} from payments that are still standing this
              tax year. Bookings that were refunded to a client are left out.
            </li>
            <li>
              <strong>Find your bracket.</strong> That puts you in bracket {tax.bracketNumber}: income from{' '}
              {formatRand(bracket.from)}
              {bracket.to != null ? ` up to ${formatRand(bracket.to)}` : ' upwards'}, taxed at {percent(bracket.rate)} on the
              part inside the bracket.
            </li>
            <li>
              <strong>Work out the tax before the rebate.</strong> {formatRand(tax.bracketBase)} (the tax on all the
              income below the bracket) + {percent(bracket.rate)} × ({formatRand(earnings)} − {formatRand(tax.bracketFloor)}) ={' '}
              {formatRand(tax.grossTax)}.
            </li>
            <li>
              <strong>Take off the primary rebate.</strong> Every taxpayer under 65 gets {formatRand(tax.rebate)} off.{' '}
              {formatRand(tax.grossTax)} − {formatRand(tax.rebate)} = {formatRand(tax.estimatedTax)} (it never goes
              below zero).
            </li>
            <li>
              <strong>What you keep.</strong> {formatRand(earnings)} − {formatRand(tax.estimatedTax)} ={' '}
              {formatRand(tax.takeHome)} take-home, which is an effective rate of {tax.effectiveRate}% of your income.
            </li>
          </ol>
          {tax.nextBracketAt != null && (
            <p className="muted small">
              You're {formatRand(tax.nextBracketAt - earnings)} away from the next bracket, where the rate on each extra
              rand rises.
            </p>
          )}

          <table className="bracket-table">
            <caption className="muted small">South African individual tax brackets (under 65), {tax.tableLabel ?? 'current'}
              {tax.tableExact === false && ' (latest published tables; this year\'s are not loaded yet)'}
            </caption>
            <thead>
              <tr>
                <th scope="col">Taxable income</th>
                <th scope="col">Rate on this slice</th>
                <th scope="col">Tax on income below it</th>
              </tr>
            </thead>
            <tbody>
              {tax.brackets.map((b, i) => (
                <tr key={b.from} aria-current={i + 1 === tax.bracketNumber ? 'true' : undefined}>
                  <td>
                    {formatRand(b.from)}
                    {b.to != null ? ` – ${formatRand(b.to)}` : ' and above'}
                  </td>
                  <td>{percent(b.rate)}</td>
                  <td>{formatRand(b.base)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
