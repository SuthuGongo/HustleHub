const crypto = require('crypto');

function load(breachCheck) {
  jest.resetModules();
  process.env.PASSWORD_BREACH_CHECK = breachCheck ? 'true' : 'false';
  const logger = require('./logger');
  const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
  return { policy: require('./passwordPolicy'), warn };
}

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex').toUpperCase();
const answer = (text, ok = true, status = 200) => jest.fn().mockResolvedValue({ ok, status, text: async () => text });

afterAll(() => { process.env.PASSWORD_BREACH_CHECK = 'false'; });

describe('common passwords and personal details', () => {
  const { policy } = load(false);

  test('very common passwords are recognised whatever the capitalisation', () => {
    expect(policy.isCommonPassword('Password1')).toBe(true);
    expect(policy.isCommonPassword('QWERTY123')).toBe(true);
    expect(policy.isCommonPassword('Zk9!vTq2#mLp')).toBe(false);
  });

  test('a password built from the name or the email name is refused', () => {
    expect(policy.containsPersonalDetail('Zanele2025!x', { name: 'Zanele Mokoena' })).toBe(true);
    expect(policy.containsPersonalDetail('thandi.k77Boom', { email: 'thandi.k77@gmail.com' })).toBe(true);
    expect(policy.containsPersonalDetail('Zk9!vTq2#mLp', { name: 'Zanele Mokoena', email: 'z@x.com' })).toBe(false);
    expect(policy.containsPersonalDetail('Abcd1234', {})).toBe(false);
  });

  test('short name parts are ignored so ordinary passwords are not refused by accident', () => {
    expect(policy.containsPersonalDetail('Xu9Lm2!pq', { name: 'Xu Li' })).toBe(false);
  });

  test('checkPassword gives a clear message for each reason and null for a good password', async () => {
    expect(await policy.checkPassword('Password1')).toMatch(/too common/);
    expect(await policy.checkPassword('Zanele2025!x', { name: 'Zanele Mokoena' })).toMatch(/name or email/);
    expect(await policy.checkPassword('Zk9!vTq2#mLp')).toBeNull();
  });
});

describe('breach lookup (k-anonymity)', () => {
  test('only the first five characters of the hash are sent, and a match is reported with its count', async () => {
    const { policy } = load(true);
    const hash = sha1('Zk9!vTq2#mLp');
    const fetchImpl = answer(`0000000000000000000000000000000000A:3\r\n${hash.slice(5)}:42\r\n`);
    expect(await policy.breachCount('Zk9!vTq2#mLp', fetchImpl)).toBe(42);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    expect(url).not.toContain(hash.slice(5));
    expect(options.headers['Add-Padding']).toBe('true');
  });

  test('a password that is not in the answer has a count of zero', async () => {
    const { policy } = load(true);
    expect(await policy.breachCount('Zk9!vTq2#mLp', answer('ABCDEF:1\nFEDCBA:2'))).toBe(0);
    expect(await policy.breachCount('Zk9!vTq2#mLp', answer('malformed line\n'))).toBe(0);
  });

  test('checkPassword refuses a breached password', async () => {
    const { policy } = load(true);
    const hash = sha1('Zk9!vTq2#mLp');
    expect(await policy.checkPassword('Zk9!vTq2#mLp', {}, answer(`${hash.slice(5)}:7`))).toMatch(/data breach/);
  });

  test('when the service is down the password is accepted and the problem is logged', async () => {
    const { policy, warn } = load(true);
    expect(await policy.checkPassword('Zk9!vTq2#mLp', {}, answer('', false, 503))).toBeNull();
    expect(await policy.checkPassword('Zk9!vTq2#mLp', {}, jest.fn().mockRejectedValue(new Error('offline')))).toBeNull();
    expect(warn).toHaveBeenCalledWith('security.breach_check_unavailable', expect.objectContaining({ error: 'offline' }));
  });

  test('with the check switched off the service is never called', async () => {
    const { policy } = load(false);
    const fetchImpl = jest.fn();
    expect(await policy.checkPassword('Zk9!vTq2#mLp', {}, fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
