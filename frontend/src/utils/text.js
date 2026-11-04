// The API stores user-entered text HTML-escaped (a defence against stored XSS), so
// "Logo & branding" arrives as "Logo &amp; branding". React already escapes everything it renders,
// so we only need to reverse the eight entities the server produces before showing text to people.
// The result is only ever placed in text nodes (never innerHTML), so this cannot re-introduce markup.
const ENTITIES = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&#x2F;': '/',
  '&#x5C;': '\\',
  '&#96;': '`',
  '&amp;': '&', // last, so "&amp;lt;" becomes "&lt;" and not "<"
};

export function decodeEntities(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/&(?:lt|gt|quot|amp|#x27|#x2F|#x5C|#96);/g, (match) => ENTITIES[match] ?? match);
}
