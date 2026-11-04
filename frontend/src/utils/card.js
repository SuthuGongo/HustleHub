// Client-side-only "does this look like a real card" checks for the simulated payment step.
// Nothing here is ever sent to the server - it exists purely so the demo card form behaves like a
// real one (catches obvious typos) before "paying" instantly. No real card network is involved.

export const TEST_CARD = '4242 4242 4242 4242';

export function formatCardNumber(value) {
  const digits = value.replace(/\D/g, '').slice(0, 19);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

// Luhn checksum: the standard "is this a structurally valid card number" algorithm used by every
// real card form. It does not know or care whether a card is real, active, or funded.
export function luhnValid(digitsOnly) {
  if (!/^\d{12,19}$/.test(digitsOnly)) return false;
  let sum = 0;
  let alt = false;
  for (let i = digitsOnly.length - 1; i >= 0; i -= 1) {
    let n = Number(digitsOnly[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function validateCardNumber(value) {
  const digits = (value || '').replace(/\D/g, '');
  if (!digits) return 'Card number is required.';
  if (digits.length < 12 || digits.length > 19) return 'Card number looks too short or too long.';
  if (!luhnValid(digits)) return "That card number doesn't look valid.";
  return '';
}

export function formatExpiry(value) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length < 3) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function validateExpiry(value) {
  const match = /^(\d{2})\/(\d{2})$/.exec(value || '');
  if (!match) return 'Use MM/YY.';
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return 'Month must be between 01 and 12.';
  const now = new Date();
  const endOfExpiryMonth = new Date(year, month, 1); // first day of the month AFTER expiry
  if (endOfExpiryMonth <= new Date(now.getFullYear(), now.getMonth(), 1)) return 'This card has expired.';
  return '';
}

export function validateCvc(value) {
  if (!/^\d{3,4}$/.test(value || '')) return 'CVC must be 3 or 4 digits.';
  return '';
}

export function validateCardholderName(value) {
  if (!value || !value.trim()) return "Cardholder's name is required.";
  if (value.trim().length > 100) return 'Name is too long.';
  return '';
}
