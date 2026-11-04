import { describe, expect, it } from 'vitest';
import { validateEmail, validateLogin, validateNewPassword } from '../utils/validation';

describe('validateEmail', () => {
  it('asks for an address when it is blank', () => {
    expect(validateEmail('   ').email).toBe('Enter your email address.');
  });

  it.each(['plainaddress', 'two@@signs.com', 'a@b@c.com', '@nouser.com', 'no dots@example', 'has space@example.com', 'user@host.c'])(
    'rejects %s',
    (value) => {
      expect(validateEmail(value).email).toBe('Enter a valid email address.');
    },
  );

  it('accepts a normal address', () => {
    expect(validateEmail('  thandi@example.co.za ')).toEqual({});
  });

  it('stays fast on a long crafted string', () => {
    const started = Date.now();
    validateEmail(`${'a@'.repeat(20000)}x`);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('validateLogin', () => {
  it('requires both fields and a valid address', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'Enter your email address.',
      password: 'Enter your password.',
    });
    expect(validateLogin({ email: 'nope', password: 'x' }).email).toBe('Enter a valid email address.');
  });
});

describe('validateNewPassword', () => {
  it.each([
    ['', 'Choose a new password.'],
    ['short1A', 'Password must be at least 8 characters.'],
    ['NoNumbersHere', 'Password must contain at least one number.'],
    ['nouppercase1', 'Password must contain at least one uppercase letter.'],
    [`A1${'a'.repeat(130)}`, 'Password must be 128 characters or fewer.'],
  ])('rejects %j', (password, message) => {
    expect(validateNewPassword(password).newPassword).toBe(message);
  });

  it('accepts a strong password', () => {
    expect(validateNewPassword('Str0ngPassword')).toEqual({});
  });
});
