import { createConnection } from 'node:net';
import { describe, expect, it } from 'vitest';
import {
  createPasswordAttemptLimiter,
  getPasswordAttemptKeys,
  type PasswordAttemptSubject,
} from '../password-attempt-limits';

// Explicitly selected disposable Unix socket; never use hosted Redis variables.
const socket = process.env.PASSWORD_ATTEMPT_REDIS_SOCKET;

function command(...args: Array<string | number>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const client = createConnection({ path: socket! });
    let response = '';
    client.setTimeout(5000, () => client.destroy(new Error('Redis timeout')));
    client.on('error', reject);
    client.on('connect', () => {
      client.write(
        `*${args.length}\r\n${args
          .map((arg) => {
            const value = String(arg);
            return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
          })
          .join('')}*1\r\n$4\r\nQUIT\r\n`
      );
    });
    client.on('data', (data) => {
      response += data.toString();
    });
    client.on('end', () => {
      const lines = response.split('\r\n');
      let index = 0;
      function parse(): unknown {
        const line = lines[index++];
        if (!line) throw new Error('Missing Redis response');
        switch (line[0]) {
          case '+':
            return line.slice(1);
          case '-':
            throw new Error(line.slice(1));
          case ':':
            return Number(line.slice(1));
          case '$':
            return Number(line.slice(1)) < 0 ? null : lines[index++];
          case '*':
            return Array.from({ length: Number(line.slice(1)) }, parse);
          default:
            throw new Error('Unexpected Redis response');
        }
      }
      try {
        resolve(parse());
      } catch (error) {
        reject(error);
      }
    });
  });
}

type Limiter = ReturnType<typeof createPasswordAttemptLimiter>;
function fixture(scope: 'nova-challenge'): {
  limiter: Limiter;
  subject: Extract<PasswordAttemptSubject, { scope: 'nova-challenge' }>;
};
function fixture(scope?: 'meet-guest' | 'meet-guest-create'): {
  limiter: Limiter;
  subject: Extract<PasswordAttemptSubject, { ip?: string | null }>;
};
function fixture(scope: PasswordAttemptSubject['scope'] = 'meet-guest') {
  const client = {
    eval: (script: string, keys: string[], args: number[]) =>
      command('EVAL', script, keys.length, ...keys, ...args),
    // Same real commands support the fail-on-old control.
    get: (key: string) => command('GET', key),
    incr: (key: string) => command('INCR', key),
    expire: (key: string, seconds: number) => command('EXPIRE', key, seconds),
    ttl: (key: string) => command('TTL', key),
    del: (key: string) => command('DEL', key),
  };
  const limiter = createPasswordAttemptLimiter(async () => client as never);
  const subject: PasswordAttemptSubject =
    scope === 'nova-challenge'
      ? { scope, target: 'plan', userId: 'user-1' }
      : { scope, target: 'plan', ip: '203.0.113.1' };
  return { limiter, subject };
}

describe.skipIf(!socket)('password budgets on disposable Redis', () => {
  it('admits only ten of 64 parallel target attempts and expires both counters', async () => {
    await command('FLUSHDB');
    const { limiter, subject } = fixture();
    const results = await Promise.all(
      Array.from({ length: 64 }, (_, i) =>
        limiter.check({ ...subject, ip: `198.51.100.${i + 1}` })
      )
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    const keys = getPasswordAttemptKeys(subject);
    expect(await command('GET', keys.target)).toBe('10');
    expect(await command('TTL', keys.target)).toBeGreaterThan(0);
    expect(
      await command(
        'TTL',
        getPasswordAttemptKeys({ ...subject, ip: '198.51.100.1' }).source
      )
    ).toBeGreaterThan(0);
  });

  it('admits only sixty of 128 user targets and allocates no denied target keys', async () => {
    await command('FLUSHDB');
    const { limiter, subject } = fixture('nova-challenge');
    const results = await Promise.all(
      Array.from({ length: 128 }, (_, i) =>
        limiter.check({ ...subject, target: `target-${i}` })
      )
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(60);
    expect(await command('DBSIZE')).toBe(121);
    const ipKey = getPasswordAttemptKeys(subject).source;
    expect(await command('GET', ipKey)).toBe('60');
    expect(await command('TTL', ipKey)).toBeGreaterThan(0);
  });

  it('bounds creation on a shared plan and permits work again after expiry', async () => {
    await command('FLUSHDB');
    const { limiter, subject } = fixture('meet-guest-create');
    const results = await Promise.all(
      Array.from({ length: 64 }, () => limiter.check(subject))
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    const keys = getPasswordAttemptKeys(subject);
    await command('EXPIRE', keys.target, 0);
    await command('EXPIRE', keys.source, 0);
    expect((await limiter.check(subject)).allowed).toBe(true);
    expect(await command('TTL', keys.target)).toBeGreaterThan(0);
  });

  it('repairs a preexisting counter without expiry while denying the spent budget', async () => {
    await command('FLUSHDB');
    const { limiter, subject } = fixture();
    const key = getPasswordAttemptKeys(subject).target;
    await command('SET', key, 10);
    expect(await limiter.check(subject)).toMatchObject({
      allowed: false,
      retryAfter: 900,
    });
    expect(await command('TTL', key)).toBeGreaterThan(0);
    expect(await command('DBSIZE')).toBe(1);
  });
  it('a shared plan admits 64 distinct source networks while bounding each source', async () => {
    await command('FLUSHDB');
    const { limiter, subject } = fixture('meet-guest-create');
    const results = await Promise.all(
      Array.from({ length: 64 }, (_, i) =>
        limiter.check({ ...subject, ip: `198.51.100.${i + 1}` })
      )
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(64);
  });

  it('refund on verified success lets 100 repeated logins succeed', async () => {
    await command('FLUSHDB');
    const { limiter, subject } = fixture();
    for (let i = 0; i < 100; i++) {
      const result = await limiter.check(subject);
      expect(result.allowed).toBe(true);
      await result.refund?.();
    }
    expect(await command('GET', getPasswordAttemptKeys(subject).target)).toBe(
      '0'
    );
  });

  it('refunds only once and cannot erase a concurrent failure', async () => {
    await command('FLUSHDB');
    const { limiter, subject } = fixture();
    await limiter.check(subject);
    const verified = await limiter.check(subject);
    await verified.refund?.();
    await verified.refund?.();
    expect(await command('GET', getPasswordAttemptKeys(subject).target)).toBe(
      '1'
    );
  });

  it('IPv6 /64 shares the aggregate budget across distinct targets', async () => {
    await command('FLUSHDB');
    const { limiter, subject } = fixture();
    const results = await Promise.all(
      Array.from({ length: 400 }, (_, i) =>
        limiter.check({
          ...subject,
          target: `target-${i}`,
          ip: `2001:db8:1:2::${(i + 1).toString(16)}`,
        })
      )
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(300);
  });

  it('an expired receipt cannot refund a replacement target window', async () => {
    await command('FLUSHDB');
    const { limiter, subject } = fixture();
    const result = await limiter.check(subject);
    const keys = getPasswordAttemptKeys(subject);
    const receipts = await command('KEYS', 'pwd:reservation:*');
    expect(Array.isArray(receipts)).toBe(true);
    if (!Array.isArray(receipts)) throw new Error('Missing receipt');
    for (const receipt of receipts) await command('EXPIRE', String(receipt), 0);
    await command('SET', keys.target, 5, 'EX', 900);
    await result.refund?.();
    expect(await command('GET', keys.target)).toBe('5');
  });
});
