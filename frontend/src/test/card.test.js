import { describe, expect, it } from 'vitest';
import {
  formatCardNumber,
  formatExpiry,
  luhnValid,
  validateCardNumber,
  validateExpiry,
  validateCvc,
  validateCardholderName,
} from '../utils/card';

describe('formatCardNumber', () => {
  it('groups digits into 4s and strips non-digits', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242');
    expect(formatCardNumber('4242-4242 4242x4242')).toBe('4242 4242 4242 4242');
  });

  it('caps at 19 digits', () => {
    expect(formatCardNumber('1'.repeat(30)).replace(/\s/g, '')).toHaveLength(19);
  });
});

describe('luhnValid', () => {
  it('accepts the standard test card number', () => {
    expect(luhnValid('4242424242424242')).toBe(true);
  });

  it('rejects a number that fails the checksum', () => {
    expect(luhnValid('4242424242424241')).toBe(false);
  });

  it('rejects anything that is not 12-19 digits', () => {
    expect(luhnValid('123')).toBe(false);
    expect(luhnValid('')).toBe(false);
  });
});

describe('validateCardNumber', () => {
  it('requires a value', () => {
    expect(validateCardNumber('')).toMatch(/required/i);
  });

  it('accepts the test card, formatted or not', () => {
    expect(validateCardNumber('4242 4242 4242 4242')).toBe('');
    expect(validateCardNumber('4242424242424242')).toBe('');
  });

  it('rejects a structurally invalid number', () => {
    expect(validateCardNumber('1234 5678 9012 3456')).toMatch(/doesn't look valid/i);
  });
});

describe('formatExpiry / validateExpiry', () => {
  it('inserts the slash after two digits', () => {
    expect(formatExpiry('1234')).toBe('12/34');
    expect(formatExpiry('1')).toBe('1');
  });

  it('rejects a month outside 01-12', () => {
    expect(validateExpiry('13/30')).toMatch(/month/i);
  });

  it('rejects a date in the past', () => {
    expect(validateExpiry('01/20')).toMatch(/expired/i);
  });

  it('accepts a valid future date', () => {
    expect(validateExpiry('12/34')).toBe('');
  });
});

describe('validateCvc', () => {
  it('accepts 3 or 4 digits', () => {
    expect(validateCvc('123')).toBe('');
    expect(validateCvc('1234')).toBe('');
  });

  it('rejects anything else', () => {
    expect(validateCvc('12')).toMatch(/3 or 4 digits/i);
    expect(validateCvc('abcd')).toMatch(/3 or 4 digits/i);
  });
});

describe('validateCardholderName', () => {
  it('requires a non-empty name', () => {
    expect(validateCardholderName('')).toMatch(/required/i);
    expect(validateCardholderName('   ')).toMatch(/required/i);
  });

  it('accepts a normal name', () => {
    expect(validateCardholderName('Aisha Naidoo')).toBe('');
  });
});
