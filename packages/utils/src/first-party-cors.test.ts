import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAllowedFirstPartyCorsOrigin as allowed } from './first-party-cors';

const prod = { development: false };
const dev = { development: true };

afterEach(() => vi.unstubAllEnvs());

describe('getAllowedFirstPartyCorsOrigin', () => {
  it('admits https Tuturuuu origins one label deep on the default port', () => {
    expect(allowed('https://tuturuuu.com', prod)).toBe('https://tuturuuu.com');
    expect(allowed('https://tasks.tuturuuu.com', prod)).toBe(
      'https://tasks.tuturuuu.com'
    );
    expect(allowed('https://tasks.tuturuuu.com:443', prod)).toBe(
      'https://tasks.tuturuuu.com'
    );
  });

  it('refuses non-default ports, deeper hosts and http outside development', () => {
    for (const origin of [
      'https://tasks.tuturuuu.com:8443',
      'https://a.b.tuturuuu.com',
      'https://evil.tasks.tuturuuu.com',
      'http://tasks.tuturuuu.com',
      'http://localhost:3000',
      'http://127.0.0.1:7809',
      'http://[::1]:7809',
      'https://tasks.tuturuuu.localhost',
    ]) {
      expect(allowed(origin, prod)).toBeNull();
    }
  });

  it('admits development origins in development and test only', () => {
    expect(allowed('http://localhost:7809', dev)).toBe('http://localhost:7809');
    expect(allowed('https://tasks.tuturuuu.localhost:1355', dev)).toBe(
      'https://tasks.tuturuuu.localhost:1355'
    );
  });

  it('fails closed for any NODE_ENV other than development or test', () => {
    for (const value of ['production', 'staging', 'preview', '']) {
      vi.stubEnv('NODE_ENV', value);
      expect(allowed('http://localhost:7809')).toBeNull();
    }
    vi.stubEnv('NODE_ENV', 'development');
    expect(allowed('http://localhost:7809')).toBe('http://localhost:7809');
    vi.stubEnv('NODE_ENV', 'test');
    expect(allowed('http://localhost:7809')).toBe('http://localhost:7809');
  });

  it('never admits the gateway origin host, lookalikes, other schemes or junk', () => {
    for (const origin of [
      'https://origin.tuturuuu.com',
      'https://tuturuuu.com.evil.test',
      'https://eviltuturuuu.com',
      'https://user:pass@tasks.tuturuuu.com',
      'ftp://tasks.tuturuuu.com',
      'null',
      '',
      null,
      undefined,
    ]) {
      expect(allowed(origin, prod)).toBeNull();
      expect(allowed(origin, dev)).toBeNull();
    }
  });
});
