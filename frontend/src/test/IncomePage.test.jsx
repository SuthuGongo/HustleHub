import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/hustlehub';
import IncomePage from '../pages/IncomePage';
import { freelancerUser, renderApp } from './utils';

vi.mock('../api/hustlehub');

const brackets = [
  { from: 0, to: 237100, rate: 0.18, base: 0 },
  { from: 237100, to: 370500, rate: 0.26, base: 42678 },
  { from: 370500, to: null, rate: 0.31, base: 77362 },
];

const months = (overrides = {}) =>
  ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02'].map((month) => ({
    month,
    total: overrides[month] ?? 0,
    count: overrides[month] ? 1 : 0,
  }));

const income = {
  data: {
    currency: 'ZAR',
    totalEarned: 2650,
    transactionCount: 3,
    averagePerBooking: 883.33,
    refundedTotal: 0,
    refundedCount: 0,
    recentTransactions: [
      { id: 't1', gigTitle: 'Logo &amp; brand identity design', client: { name: 'Aisha Naidoo' }, createdAt: '2026-09-20T10:00:00Z', reference: 'TXN-ABC123DEF456', amount: 450 },
    ],
    tax: {
      taxYearLabel: '2026/2027 tax year (1 Mar 2026 - 28 Feb 2027)',
      taxYearEarnings: 2650,
      estimatedTax: 0,
      effectiveRate: 0,
      takeHome: 2650,
      rebate: 17820,
      grossTax: 477,
      marginalRate: 0.18,
      bracketNumber: 1,
      bracketFloor: 0,
      bracketBase: 0,
      nextBracketAt: 245100,
      taxFreeThreshold: 99000,
      tableLabel: '2026/2027',
      tableExact: true,
      brackets,
      monthly: months({ '2026-09': 2650 }),
    },
  },
};

// A freelancer well into the second bracket: R300,000 earned => R58,392 before rebate, R40,572 after.
const higherEarner = {
  data: {
    ...income.data,
    totalEarned: 300000,
    transactionCount: 12,
    averagePerBooking: 25000,
    tax: {
      ...income.data.tax,
      taxYearEarnings: 300000,
      estimatedTax: 40572,
      effectiveRate: 13.52,
      takeHome: 259428,
      grossTax: 58392,
      marginalRate: 0.26,
      bracketNumber: 2,
      bracketFloor: 245100,
      bracketBase: 44118,
      nextBracketAt: 383100,
      monthly: months({ '2026-03': 100000, '2026-09': 200000 }),
    },
  },
};

describe('IncomePage', () => {
  beforeEach(() => {
    // People who prefer reduced motion see the final figure immediately (no count-up).
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} });
    api.getIncome.mockResolvedValue(income);
  });

  it('shows the totals and the recent payments with readable titles', async () => {
    renderApp(<IncomePage />, { user: freelancerUser });
    const summary = await screen.findByLabelText('Income summary');
    expect(await within(summary).findByText('R2,650.00')).toBeInTheDocument();
    expect(within(summary).getByText('R883.33')).toBeInTheDocument();
    expect(screen.getByText('Logo & brand identity design')).toBeInTheDocument();
    expect(screen.getByText(/TXN-ABC123DEF456/)).toBeInTheDocument();
  });

  it('shows the estimated tax, take-home and effective rate', async () => {
    api.getIncome.mockResolvedValue(higherEarner);
    renderApp(<IncomePage />, { user: freelancerUser });
    expect(await screen.findByRole('heading', { name: 'Estimated tax' })).toBeInTheDocument();
    const tax = screen.getByLabelText('Tax estimate');
    expect(within(tax).getByText('R40,572.00')).toBeInTheDocument();
    expect(within(tax).getByText('R259,428.00')).toBeInTheDocument();
    expect(within(tax).getByText('13.52%')).toBeInTheDocument();
    expect(within(tax).getByText('26%')).toBeInTheDocument(); // tax on the next rand
    expect(screen.getByText(/2026\/2027 tax year/)).toBeInTheDocument();
  });

  it('charts take-home against tax and income by month', async () => {
    api.getIncome.mockResolvedValue(higherEarner);
    renderApp(<IncomePage />, { user: freelancerUser });
    expect(await screen.findByText('Take-home vs tax')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Income by month across the 2026\/2027 tax year/ })).toBeInTheDocument();
    ['Mar', 'Sep', 'Feb'].forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());
  });

  it('shows how far the freelancer is through the tax-free threshold', async () => {
    renderApp(<IncomePage />, { user: freelancerUser });
    const bar = await screen.findByRole('progressbar', { name: /tax-free threshold/i });
    expect(bar).toHaveAttribute('aria-valuenow', '3'); // 2,650 of 99,000
    expect(screen.getByText(/no tax is due|before any tax is due/i)).toBeInTheDocument();
  });

  it('says so once the freelancer is past the threshold', async () => {
    api.getIncome.mockResolvedValue(higherEarner);
    renderApp(<IncomePage />, { user: freelancerUser });
    const bar = await screen.findByRole('progressbar', { name: /tax-free threshold/i });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText(/You're past the R99,000.00 tax-free threshold/)).toBeInTheDocument();
  });

  it('explains the calculation step by step with the freelancer\'s own numbers', async () => {
    api.getIncome.mockResolvedValue(higherEarner);
    renderApp(<IncomePage />, { user: freelancerUser });
    expect(await screen.findByText('How this estimate is calculated')).toBeInTheDocument();
    expect(screen.getByText(/That puts you in bracket 2/)).toBeInTheDocument();
    expect(screen.getByText(/R44,118.00 \(the tax on all the income below the bracket\)/)).toBeInTheDocument();
    expect(screen.getByText(/R58,392.00 − R17,820.00 = R40,572.00/)).toBeInTheDocument();
    expect(screen.getByText(/R83,100.00 away from the next bracket/)).toBeInTheDocument();
  });

  it('lists the brackets and marks the one the freelancer is in', async () => {
    api.getIncome.mockResolvedValue(higherEarner);
    renderApp(<IncomePage />, { user: freelancerUser });
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(4); // header + 3 brackets
    expect(rows[2]).toHaveAttribute('aria-current', 'true');
    expect(rows[1]).not.toHaveAttribute('aria-current');
  });

  it('still renders when the API sends no explanation data (older response shape)', async () => {
    api.getIncome.mockResolvedValue({
      data: { ...income.data, tax: { taxYearLabel: '2026/2027 tax year', taxYearEarnings: 2650, estimatedTax: 0, effectiveRate: 0, takeHome: 2650, rebate: 17820 } },
    });
    renderApp(<IncomePage />, { user: freelancerUser });
    expect(await screen.findByRole('heading', { name: 'Estimated tax' })).toBeInTheDocument();
    expect(screen.queryByText('How this estimate is calculated')).not.toBeInTheDocument();
  });

  it('shows a refunded payment as refunded and keeps it out of the earned figures', async () => {
    api.getIncome.mockResolvedValue({
      data: {
        ...income.data,
        totalEarned: 2200,
        transactionCount: 2,
        averagePerBooking: 1100,
        refundedTotal: 450,
        refundedCount: 1,
        recentTransactions: [
          { id: 't1', status: 'refunded', gigTitle: 'Logo design', client: { name: 'Aisha Naidoo' }, createdAt: '2026-09-20T10:00:00Z', reference: 'TXN-REFUNDED0001', amount: 450 },
        ],
      },
    });
    renderApp(<IncomePage />, { user: freelancerUser });
    const summary = await screen.findByLabelText('Income summary');
    expect(await within(summary).findByText('R2,200.00')).toBeInTheDocument(); // total no longer includes the refunded R450
    expect(within(summary).getByText('Refunded to clients')).toBeInTheDocument();
    expect(within(summary).getByText('R450.00')).toBeInTheDocument();
    expect(screen.getByText('Refunded')).toBeInTheDocument();
  });

  it('shows an encouraging empty state before the first booking', async () => {
    api.getIncome.mockResolvedValue({ data: { ...income.data, totalEarned: 0, transactionCount: 0, averagePerBooking: 0, recentTransactions: [] } });
    renderApp(<IncomePage />, { user: freelancerUser });
    expect(await screen.findByRole('heading', { name: 'No income yet' })).toBeInTheDocument();
  });

  it('shows an error when the income cannot be loaded', async () => {
    api.getIncome.mockRejectedValue(new Error('Cannot reach the server. Check your connection and try again.'));
    renderApp(<IncomePage />, { user: freelancerUser });
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
  });
});
