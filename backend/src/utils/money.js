// Amounts are stored as Rand values with two decimals. Rounding after every
// arithmetic operation avoids floating-point drift (e.g. 0.1 + 0.2).
function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

module.exports = { roundMoney };
