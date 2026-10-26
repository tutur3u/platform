// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  constantTimeEqual,
  hashGuardValue,
  parseGuardSecrets,
  signGuardRequest,
  verifyGuardRequest,
} from '../crypto';
import { GUARD_DIGEST_PATTERN } from '../protocol';

const SECRET = 's'.repeat(40);
const PEPPER = 'p'.repeat(40);

describe('hashGuardValue', () => {
  it('produces stable opaque digests that hide the raw value', async () => {
    const first = await hashGuardValue(PEPPER, 'p:offline', 'ip:203.0.113.4');
    const second = await hashGuardValue(PEPPER, 'p:offline', 'ip:203.0.113.4');
    expect(first).toBe(second);
    expect(first).toMatch(GUARD_DIGEST_PATTERN);
    expect(first).not.toContain('203');
  });

  it('separates domains and peppers', async () => {
    const base = await hashGuardValue(PEPPER, 'p:offline', 'ip:1.1.1.1');
    expect(await hashGuardValue(PEPPER, 'k:offline', 'ip:1.1.1.1')).not.toBe(
      base
    );
    expect(await hashGuardValue(PEPPER, 'p:replay', 'ip:1.1.1.1')).not.toBe(
      base
    );
    expect(
      await hashGuardValue('q'.repeat(40), 'p:offline', 'ip:1.1.1.1')
    ).not.toBe(base);
  });
});

describe('request signatures', () => {
  const request = {
    method: 'POST',
    path: '/v1/rpc',
    body: '{"v":1}',
  };

  async function signed(timestamp = 1_000_000, secret = SECRET) {
    return signGuardRequest({ ...request, secret, timestamp });
  }

  it('accepts a fresh signature', async () => {
    const { timestamp, signature } = await signed();
    await expect(
      verifyGuardRequest({
        ...request,
        secrets: [SECRET],
        timestamp,
        signature,
        now: 1_000_000 + 59_000,
      })
    ).resolves.toBe(true);
  });

  it('rejects stale, future, tampered and unsigned requests', async () => {
    const { timestamp, signature } = await signed();
    const verify = (overrides: Record<string, unknown>) =>
      verifyGuardRequest({
        ...request,
        secrets: [SECRET],
        timestamp,
        signature,
        now: 1_000_000,
        ...overrides,
      });
    await expect(verify({ now: 1_000_000 + 61_000 })).resolves.toBe(false);
    await expect(verify({ now: 1_000_000 - 61_000 })).resolves.toBe(false);
    await expect(verify({ body: '{"v":2}' })).resolves.toBe(false);
    await expect(verify({ path: '/v1/other' })).resolves.toBe(false);
    await expect(verify({ method: 'PUT' })).resolves.toBe(false);
    await expect(verify({ signature: null })).resolves.toBe(false);
    await expect(verify({ timestamp: 'abc' })).resolves.toBe(false);
    await expect(verify({ secrets: [] })).resolves.toBe(false);
    await expect(verify({ secrets: ['x'.repeat(40)] })).resolves.toBe(false);
  });

  it('accepts the previous secret during rotation', async () => {
    const previous = 'r'.repeat(40);
    const { timestamp, signature } = await signed(1_000_000, previous);
    await expect(
      verifyGuardRequest({
        ...request,
        secrets: parseGuardSecrets(` ${SECRET} , ${previous} ,`),
        timestamp,
        signature,
        now: 1_000_000,
      })
    ).resolves.toBe(true);
  });
});

describe('constantTimeEqual', () => {
  it('compares full values including length', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });
});
