// A minimal CSV serialiser - one small, dependency-free function rather than pulling in a package for
// something this simple. Every field is quoted if it contains a comma, a quote, or a newline, and any
// quote inside a field is doubled, which is the one escaping rule CSV actually needs (RFC 4180).
function toCsvField(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows) {
  return rows.map((row) => row.map(toCsvField).join(',')).join('\r\n');
}

module.exports = { toCsv };
