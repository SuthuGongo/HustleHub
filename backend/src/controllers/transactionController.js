const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const { roundMoney } = require('../utils/money');
const { estimateTax, currentTaxYearRange, bracketTable, monthlyIncome, taxFreeThreshold } = require('../utils/tax');
const { ROLES } = require('../utils/constants');

function scopeFor(user) {
  if (user.role === ROLES.CLIENT) return { client: user.id };
  if (user.role === ROLES.FREELANCER) return { freelancer: user.id };
  return {};
}

// GET /api/transactions  (client | freelancer | admin) - role-scoped:
// clients see what they paid, freelancers what they earned, admins everything.
async function listTransactions(req, res, next) {
  try {
    const transactions = await Transaction.find(scopeFor(req.user))
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('client', 'name')
      .populate('freelancer', 'name');
    res.status(200).json({ success: true, data: { transactions } });
  } catch (err) {
    next(err);
  }
}

// GET /api/transactions/income  (freelancer) - income earned from bookings, tied to the logged-in freelancer only
async function getIncomeSummary(req, res, next) {
  try {
    const freelancerId = new mongoose.Types.ObjectId(req.user.id);

    // Only payments that are still "completed" count as income. A booking an admin refunded to the
    // client is status 'refunded' and drops out of every figure below (shown separately as refunded).
    const match = { freelancer: freelancerId, status: 'completed' };
    const refundMatch = { freelancer: freelancerId, status: 'refunded' };
    const [[totals], transactionCount, [refundTotals], refundedCount] = await Promise.all([
      Transaction.aggregate([{ $match: match }, { $group: { _id: null, totalEarned: { $sum: '$amount' } } }]),
      Transaction.countDocuments(match),
      Transaction.aggregate([{ $match: refundMatch }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Transaction.countDocuments(refundMatch),
    ]);

    const totalEarned = roundMoney(totals ? totals.totalEarned : 0);
    const refundedTotal = roundMoney(refundTotals ? refundTotals.total : 0);

    // Tax estimate: scoped to the current SA tax year (1 Mar - end Feb) only, not all-time earnings -
    // see utils/tax.js for the bracket table and what this estimate does and doesn't account for.
    const { start, end, label, year } = currentTaxYearRange();
    const taxYearMatch = { freelancer: freelancerId, status: 'completed', createdAt: mongoose.trusted({ $gte: start, $lt: end }) }; // operators we built ourselves, not user input - see gigController.js for why trusted() is needed
    // The month-by-month rows double as the source of the tax-year total, so the chart and the tax
    // figure can never disagree with each other.
    const taxYearRows = await Transaction.find(taxYearMatch).select('amount createdAt').lean();
    const monthly = monthlyIncome(taxYearRows, start);
    const taxYearEarnings = roundMoney(taxYearRows.reduce((sum, r) => sum + r.amount, 0));
    const tax = estimateTax(taxYearEarnings, year);

    const recent = await Transaction.find({ freelancer: req.user.id })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('client', 'name');

    res.status(200).json({
      success: true,
      data: {
        currency: 'ZAR',
        totalEarned,
        transactionCount,
        averagePerBooking: transactionCount ? roundMoney(totalEarned / transactionCount) : 0,
        refundedTotal,
        refundedCount,
        recentTransactions: recent,
        tax: {
          taxYearLabel: label,
          taxYearEarnings,
          estimatedTax: tax.estimatedTax,
          effectiveRate: tax.effectiveRate,
          takeHome: tax.takeHome,
          rebate: tax.rebate,
          // The working, so the page can explain the answer rather than just state it.
          grossTax: tax.grossTax,
          marginalRate: tax.marginalRate,
          bracketNumber: tax.bracketNumber,
          bracketFloor: tax.bracketFloor,
          bracketBase: tax.bracketBase,
          nextBracketAt: tax.nextBracketAt,
          taxFreeThreshold: taxFreeThreshold(year),
          tableLabel: tax.tableLabel,
          tableExact: tax.tableExact,
          brackets: bracketTable(year),
          monthly,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listTransactions, getIncomeSummary };
