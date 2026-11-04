const { roundMoney } = require('./money');

// Approximate personal income tax estimate for a freelancer (sole proprietor, individual taxpayer,
// under 65), using South Africa's published SARS individual tax tables and primary rebate. This is a
// simplified estimate for demonstration purposes only - it does not account for provisional tax,
// deductible business expenses, medical aid credits, retirement contributions, or any rebate beyond
// the primary one. It is not tax advice.
//
// Source: SARS "Rates of tax for individuals" (sars.gov.za). Each table is keyed by the calendar year
// the tax year STARTS in (the tax year runs 1 March - end of February), which is what
// currentTaxYearRange() reports.
const TAX_TABLES = {
  2025: {
    label: '2025/2026',
    rebate: 17235,
    brackets: [
      { upTo: 237100, rate: 0.18, base: 0 },
      { upTo: 370500, rate: 0.26, base: 42678 },
      { upTo: 512800, rate: 0.31, base: 77362 },
      { upTo: 673000, rate: 0.36, base: 121475 },
      { upTo: 857900, rate: 0.39, base: 179147 },
      { upTo: 1817000, rate: 0.41, base: 251258 },
      { upTo: Infinity, rate: 0.45, base: 644489 },
    ],
  },
  2026: {
    label: '2026/2027',
    rebate: 17820,
    brackets: [
      { upTo: 245100, rate: 0.18, base: 0 },
      { upTo: 383100, rate: 0.26, base: 44118 },
      { upTo: 530200, rate: 0.31, base: 79998 },
      { upTo: 695800, rate: 0.36, base: 125599 },
      { upTo: 887000, rate: 0.39, base: 185215 },
      { upTo: 1878600, rate: 0.41, base: 259783 },
      { upTo: Infinity, rate: 0.45, base: 666339 },
    ],
  },
};

const KNOWN_YEARS = Object.keys(TAX_TABLES).map(Number).sort((a, b) => a - b);
const LATEST_TAX_YEAR = KNOWN_YEARS[KNOWN_YEARS.length - 1];

// The table for a tax year (given as the year it starts). A year after the newest table - SARS has
// not been loaded for it yet - uses the newest, and `exact` is false so the page can say so instead
// of quietly presenting last year's numbers as this year's.
function taxTableFor(taxYear = LATEST_TAX_YEAR) {
  const year = Number(taxYear);
  const exact = Object.prototype.hasOwnProperty.call(TAX_TABLES, year);
  const usedYear = exact ? year : year > LATEST_TAX_YEAR ? LATEST_TAX_YEAR : KNOWN_YEARS[0];
  const table = TAX_TABLES[usedYear];
  const floors = table.brackets.map((_, i) => (i === 0 ? 0 : table.brackets[i - 1].upTo));
  return { ...table, floors, exact, year: usedYear };
}

// Income below this owes no tax at all: the first bracket's tax (18%) is fully cancelled by the
// primary rebate. E.g. 2026/2027: 17,820 / 0.18 = R99,000, matching SARS's published threshold.
function taxFreeThreshold(taxYear = LATEST_TAX_YEAR) {
  const table = taxTableFor(taxYear);
  return table.rebate / table.brackets[0].rate;
}

// Pure function: given a taxable income amount and the tax year it was earned in, returns the gross
// tax per that year's bracket table, the rebate applied, the tax actually payable (never below zero)
// and the effective rate. Kept pure and synchronous so it is trivially unit-testable.
function estimateTax(taxableIncome, taxYear = LATEST_TAX_YEAR) {
  const table = taxTableFor(taxYear);
  const income = Math.max(0, Number(taxableIncome) || 0);

  const bracketIndex = table.brackets.findIndex((b) => income <= b.upTo);
  const bracket = table.brackets[bracketIndex];
  const floor = table.floors[bracketIndex];
  const grossTax = roundMoney(bracket.base + (income - floor) * bracket.rate);

  const estimatedTax = roundMoney(Math.max(0, grossTax - table.rebate));
  const effectiveRate = income > 0 ? roundMoney((estimatedTax / income) * 100) : 0;
  const takeHome = roundMoney(income - estimatedTax);

  return {
    taxableIncome: roundMoney(income),
    grossTax,
    rebate: table.rebate,
    estimatedTax,
    effectiveRate,
    takeHome,
    // Where this income sits in the table, so the UI can show the working instead of just the answer.
    marginalRate: bracket.rate,
    bracketFloor: floor,
    bracketBase: bracket.base,
    bracketNumber: bracketIndex + 1,
    nextBracketAt: Number.isFinite(bracket.upTo) ? bracket.upTo : null,
    tableLabel: table.label,
    tableExact: table.exact,
  };
}

// The bracket table in a JSON-safe shape (Infinity cannot be serialised), for the "how is this
// calculated" explanation on the income page.
function bracketTable(taxYear = LATEST_TAX_YEAR) {
  const table = taxTableFor(taxYear);
  return table.brackets.map((b, i) => ({
    from: table.floors[i],
    to: Number.isFinite(b.upTo) ? b.upTo : null,
    rate: b.rate,
    base: b.base,
  }));
}

// Splits earnings into the 12 months of a tax year (March first), so the dashboard can chart income
// month by month. Months with no earnings are included as zero so the chart never has gaps.
// Takes plain { amount, createdAt } rows; done in application code (not a database aggregation) the
// same way the admin trend is, so it behaves identically on MongoDB and FerretDB.
function monthlyIncome(rows, start) {
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    return { month: d.toISOString().slice(0, 7), total: 0, count: 0 };
  });
  const byKey = new Map(months.map((m) => [m.month, m]));
  rows.forEach((r) => {
    const bucket = byKey.get(new Date(r.createdAt).toISOString().slice(0, 7));
    if (bucket) {
      bucket.total += r.amount;
      bucket.count += 1;
    }
  });
  return months.map((m) => ({ ...m, total: roundMoney(m.total) }));
}

// The South African tax year runs 1 March to the end of February. Given "now", returns the
// [start, end) bounds of the tax year currently in progress, and the year it starts in.
function currentTaxYearRange(now = new Date()) {
  const year = now.getUTCMonth() >= 2 /* March = index 2 */ ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const start = new Date(Date.UTC(year, 2, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year + 1, 2, 1, 0, 0, 0)); // exclusive
  const label = `${year}/${year + 1} tax year (1 Mar ${year} - 28 Feb ${year + 1})`;
  return { start, end, label, year };
}

module.exports = {
  estimateTax,
  currentTaxYearRange,
  bracketTable,
  monthlyIncome,
  taxTableFor,
  taxFreeThreshold,
  TAX_TABLES,
  LATEST_TAX_YEAR,
};
