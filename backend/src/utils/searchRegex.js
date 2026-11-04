// A small, shared helper for turning free-text search input into a safe, case-insensitive "contains"
// match: user-typed text is never interpolated into a RegExp directly (that would let someone submit
// their own regex metacharacters, at best causing an unhelpful search and at worst a ReDoS pattern),
// so every regex character in the input is escaped first. Used by every admin search box.
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsRegex(text) {
  return new RegExp(escapeRegex(text), 'i');
}

module.exports = { escapeRegex, containsRegex };
