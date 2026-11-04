import { describe, expect, it } from 'vitest';
import { decodeEntities } from '../utils/text';
import { formatRand, pluralise } from '../utils/format';
import { validateGig, validateLogin, validateRegister } from '../utils/validation';

describe('decodeEntities', () => {
  it('turns the server\'s escaped characters back into readable text', () => {
    expect(decodeEntities('Logo &amp; brand &#x27;kit&#x27;')).toBe("Logo & brand 'kit'");
  });

  it('does not double-decode: a user who typed "&amp;" sees "&amp;"', () => {
    expect(decodeEntities('&amp;amp;')).toBe('&amp;');
  });

  it('keeps escaped markup as harmless text', () => {
    expect(decodeEntities('&lt;script&gt;alert(1)&lt;&#x2F;script&gt;')).toBe('<script>alert(1)</script>');
  });

  it('returns an empty string for non-strings', () => {
    expect(decodeEntities(undefined)).toBe('');
  });
});

describe('formatting', () => {
  it('formats rand with thousands separators and two decimals', () => {
    expect(formatRand(1200)).toBe('R1,200.00');
    expect(formatRand(450.5)).toBe('R450.50');
  });
  it('pluralises', () => {
    expect(pluralise(1, 'day')).toBe('1 day');
    expect(pluralise(5, 'day')).toBe('5 days');
  });
});

describe('validateLogin', () => {
  it('flags empty fields and bad emails', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({ email: 'Enter your email address.', password: 'Enter your password.' });
    expect(validateLogin({ email: 'nope', password: 'x' }).email).toMatch(/valid email/);
    expect(validateLogin({ email: 'a@b.co', password: 'x' })).toEqual({});
  });
});

describe('validateRegister', () => {
  const ok = { name: 'Thabo', email: 'thabo@example.com', password: 'Passw0rdOK', role: 'client' };
  it('accepts a valid registration', () => expect(validateRegister(ok)).toEqual({}));
  it('enforces the password policy', () => {
    expect(validateRegister({ ...ok, password: 'short1A' }).password).toMatch(/8 characters/);
    expect(validateRegister({ ...ok, password: 'nonumbersHere' }).password).toMatch(/number/);
    expect(validateRegister({ ...ok, password: 'nouppercase1' }).password).toMatch(/uppercase/);
  });
  it('never allows the admin role from the UI', () => {
    expect(validateRegister({ ...ok, role: 'admin' }).role).toBeDefined();
  });
});

describe('validateGig', () => {
  const ok = { title: 'Logo design', description: 'A description that is long enough to pass.', category: 'design', price: '450.50', deliveryDays: '5' };
  it('accepts a valid gig', () => expect(validateGig(ok)).toEqual({}));
  it('rejects bad prices and delivery times', () => {
    expect(validateGig({ ...ok, price: '-5' }).price).toBeDefined();
    expect(validateGig({ ...ok, price: '10.123' }).price).toBeDefined();
    expect(validateGig({ ...ok, price: '0' }).price).toBeDefined();
    expect(validateGig({ ...ok, deliveryDays: '2.5' }).deliveryDays).toBeDefined();
    expect(validateGig({ ...ok, deliveryDays: '400' }).deliveryDays).toBeDefined();
  });
  it('rejects short text and unknown categories', () => {
    expect(validateGig({ ...ok, title: 'abc' }).title).toBeDefined();
    expect(validateGig({ ...ok, description: 'too short' }).description).toBeDefined();
    expect(validateGig({ ...ok, category: 'hacking' }).category).toBeDefined();
  });
});
