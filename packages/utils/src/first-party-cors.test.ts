import { describe, expect, it } from 'vitest';
import { getAllowedFirstPartyCorsOrigin as allowed } from './first-party-cors';

const prod = { production: true };
const dev = { production: false };

describe('getAllowedFirstPartyCorsOrigin', () => {
  it('admits https Tuturuuu origins in production', () => {
    expect(allowed('https://tuturuuu.com', prod)).toBe('https://tuturuuu.com');
    expect(allowed('https://tasks.tuturuuu.com', prod)).toBe(
      'https://tasks.tuturuuu.com'
    );
  });

  it('refuses loopback, portless and http origins in production', () => {
    for (const origin of [
      'http://localhost:3000',
      'http://127.0.0.1:7809',
      'http://[::1]:7809',
      'https://tasks.tuturuuu.localhost',
      'http://tasks.tuturuuu.com',
    ]) {
      expect(allowed(origin, prod)).toBeNull();
    }
  });

  it('admits development origins outside production', () => {
    expect(allowed('http://localhost:7809', dev)).toBe('http://localhost:7809');
    expect(allowed('https://tasks.tuturuuu.localhost:1355', dev)).toBe(
      'https://tasks.tuturuuu.localhost:1355'
    );
  });

  it('never admits the gateway origin host, lookalikes or junk', () => {
    for (const origin of [
      'https://origin.tuturuuu.com',
      'https://tuturuuu.com.evil.test',
      'https://eviltuturuuu.com',
      'https://user:pass@tasks.tuturuuu.com',
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
