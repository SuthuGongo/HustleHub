const {
  estimateTax,
  currentTaxYearRange,
  bracketTable,
  monthlyIncome,
  taxTableFor,
  taxFreeThreshold,
  TAX_TABLES,
} = require('./tax');

// Every tax year we hold a table for is put through the same checks, so adding a year later is just
// adding its table and getting these tests for free.
describe.each(Object.keys(TAX_TABLES).map(Number))('estimateTax, tax year starting %i', (year) => {
  const { brackets, rebate } = TAX_TABLES[year];
  const est = (income) => estimateTax(income, year);

  test('zero/negative/missing income owes no tax', () => {
    [0, -5000, undefined, NaN].forEach((v) => {
      expect(est(v)).toMatchObject({ estimatedTax: 0, takeHome: 0, effectiveRate: 0 });
    });
  });

  test('income below the tax-free threshold owes nothing, even though the bracket is taxed', () => {
    const result = est(90000);
    expect(result.grossTax).toBeLessThan(rebate);
    expect(result.estimatedTax).toBe(0);
    expect(result.takeHome).toBe(result.taxableIncome);
  });

  test('first bracket: 18% of full income, less the rebate', () => {
    const income = brackets[0].upTo - 1000;
    const result = est(income);
    expect(result.grossTax).toBe(income * 0.18);
    expect(result.estimatedTax).toBe(Math.max(0, result.grossTax - rebate));
  });

  test('exactly on a bracket boundary uses that bracket, one rand over rolls into the next', () => {
    const boundary = brackets[0].upTo;
    expect(est(boundary).grossTax).toBe(boundary * 0.18);
    expect(est(boundary + 1).grossTax).toBeCloseTo(brackets[1].base + brackets[1].rate, 2);
  });

  test('every bracket applies base plus marginal rate above its floor', () => {
    brackets.forEach((b, i) => {
      const floor = i === 0 ? 0 : brackets[i - 1].upTo;
      const income = floor + 1000;
      const expected = b.base + 1000 * b.rate;
      expect(est(income).grossTax).toBeCloseTo(expected, 2);
      expect(est(income).bracketNumber).toBe(i + 1);
    });
  });

  test('bracket bases are continuous: tax at a boundary equals the next bracket base', () => {
    brackets.slice(0, -1).forEach((b, i) => {
      expect(b.base + (b.upTo - (i === 0 ? 0 : brackets[i - 1].upTo)) * b.rate).toBeCloseTo(brackets[i + 1].base, 0);
    });
  });

  test('take-home equals income minus tax, and tax never exceeds income', () => {
    [0, 50000, 237100, 500000, 1000000, 5000000].forEach((income) => {
      const r = est(income);
      expect(r.takeHome).toBeCloseTo(r.taxableIncome - r.estimatedTax, 2);
      expect(r.estimatedTax).toBeLessThanOrEqual(r.taxableIncome);
      expect(r.estimatedTax).toBeGreaterThanOrEqual(0);
    });
  });

  test('the effective rate is estimated tax / income as a percentage', () => {
    const r = est(500000);
    expect(r.effectiveRate).toBeCloseTo((r.estimatedTax / r.taxableIncome) * 100, 2);
  });

  test('tax-free threshold is rebate / 18%, owes nothing at it and 18c one rand over', () => {
    const threshold = taxFreeThreshold(year);
    expect(threshold).toBe(rebate / 0.18);
    expect(est(threshold).estimatedTax).toBe(0);
    expect(est(threshold + 1).estimatedTax).toBeCloseTo(0.18, 2);
  });

  test('the top bracket has no next bracket', () => {
    expect(est(5000000).nextBracketAt).toBeNull();
    expect(est(5000000).marginalRate).toBe(0.45);
  });

  test('bracketTable is JSON-safe (no Infinity) and contiguous from R0 upwards', () => {
    const table = bracketTable(year);
    expect(JSON.parse(JSON.stringify(table))).toEqual(table);
    expect(table[0].from).toBe(0);
    table.slice(1).forEach((row, i) => expect(row.from).toBe(table[i].to));
    expect(table[table.length - 1].to).toBeNull();
  });
});

describe('published figures (SARS)', () => {
  test('2025/2026: R300,000 = 42,678 + 26% of 62,900 = 59,032, less rebate 17,235 = 41,797', () => {
    const r = estimateTax(300000, 2025);
    expect(r).toMatchObject({ grossTax: 59032, estimatedTax: 41797, takeHome: 258203, rebate: 17235, tableLabel: '2025/2026' });
    expect(taxFreeThreshold(2025)).toBe(95750);
  });

  test('2026/2027: R300,000 = 44,118 + 26% of 54,900 = 58,392, less rebate 17,820 = 40,572', () => {
    const r = estimateTax(300000, 2026);
    expect(r).toMatchObject({ grossTax: 58392, estimatedTax: 40572, takeHome: 259428, rebate: 17820, tableLabel: '2026/2027' });
    expect(r.bracketNumber).toBe(2);
    expect(r.bracketFloor).toBe(245100);
    expect(r.nextBracketAt).toBe(383100);
    expect(taxFreeThreshold(2026)).toBe(99000);
  });
});

describe('choosing the table for a tax year', () => {
  test('a known year uses its own table and is exact', () => {
    expect(taxTableFor(2025)).toMatchObject({ exact: true, label: '2025/2026' });
    expect(taxTableFor(2026)).toMatchObject({ exact: true, label: '2026/2027' });
  });

  test('a year not loaded yet falls back to the newest table and says it is not exact', () => {
    const r = estimateTax(300000, 2031);
    expect(r.tableLabel).toBe('2026/2027');
    expect(r.tableExact).toBe(false);
  });

  test('the default is the newest table', () => {
    expect(estimateTax(300000).tableLabel).toBe('2026/2027');
  });
});

describe('currentTaxYearRange', () => {
  test('March is the start of that calendar year\'s tax year', () => {
    const { start, end, label, year } = currentTaxYearRange(new Date('2026-03-01T00:00:00Z'));
    expect(start.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-03-01T00:00:00.000Z');
    expect(label).toContain('2026/2027');
    expect(year).toBe(2026);
  });

  test('February and January belong to the PREVIOUS calendar year\'s tax year', () => {
    expect(currentTaxYearRange(new Date('2027-02-28T12:00:00Z')).year).toBe(2026);
    expect(currentTaxYearRange(new Date('2027-01-15T00:00:00Z')).start.getUTCFullYear()).toBe(2026);
  });

  test('the rollover day itself (1 March) flips to the new tax year', () => {
    expect(currentTaxYearRange(new Date('2027-02-28T23:59:59Z')).year).toBe(2026);
    expect(currentTaxYearRange(new Date('2027-03-01T00:00:00Z')).year).toBe(2027);
  });

  test('end is always exactly one year after start', () => {
    const { start, end } = currentTaxYearRange(new Date('2027-07-04T00:00:00Z'));
    expect(end.getUTCFullYear() - start.getUTCFullYear()).toBe(1);
    expect(end.getUTCMonth()).toBe(start.getUTCMonth());
    expect(end.getUTCDate()).toBe(start.getUTCDate());
  });
});

describe('monthlyIncome', () => {
  const { start } = currentTaxYearRange(new Date('2026-05-10T00:00:00Z')); // 1 Mar 2026 start

  test('always returns 12 months starting in March, empty months as zero', () => {
    const months = monthlyIncome([], start);
    expect(months).toHaveLength(12);
    expect(months[0].month).toBe('2026-03');
    expect(months[11].month).toBe('2027-02');
    expect(months.every((m) => m.total === 0 && m.count === 0)).toBe(true);
  });

  test('adds each payment to the month it was made in', () => {
    const months = monthlyIncome(
      [
        { amount: 500, createdAt: new Date('2026-03-15T10:00:00Z') },
        { amount: 250.5, createdAt: new Date('2026-03-31T23:00:00Z') },
        { amount: 1000, createdAt: new Date('2026-05-01T00:00:00Z') },
      ],
      start
    );
    expect(months[0]).toMatchObject({ month: '2026-03', total: 750.5, count: 2 });
    expect(months[2]).toMatchObject({ month: '2026-05', total: 1000, count: 1 });
  });

  test('the monthly totals add up to the whole tax-year total', () => {
    const rows = [
      { amount: 100, createdAt: new Date('2026-04-02T00:00:00Z') },
      { amount: 200, createdAt: new Date('2026-09-02T00:00:00Z') },
      { amount: 300, createdAt: new Date('2027-02-27T00:00:00Z') },
    ];
    expect(monthlyIncome(rows, start).reduce((acc, m) => acc + m.total, 0)).toBe(600);
  });
});
