import { afterEach, describe, expect, it, vi } from 'vitest';
import { seal, unseal } from './crypto';

afterEach(() => vi.unstubAllEnvs());
describe('connected mail encryption', () => {
  it('uses randomized authenticated encryption tied to the account owner', () => {
    vi.stubEnv('MAIL_CONNECTED_ACCOUNTS_KEY', 'a'.repeat(64));
    const first = seal({ accessToken: 'synthetic-token' }, 'owner');
    expect(first).not.toContain('synthetic-token');
    expect(first).not.toBe(seal({ accessToken: 'synthetic-token' }, 'owner'));
    expect(unseal(first, 'owner')).toEqual({ accessToken: 'synthetic-token' });
    expect(() => unseal(first, 'other')).toThrow();
    expect(() => unseal(`${first.slice(0, -4)}abcd`, 'owner')).toThrow();
  });
  it('fails closed when the encryption key is absent or invalid', () => {
    vi.stubEnv('MAIL_CONNECTED_ACCOUNTS_KEY', '');
    expect(() => seal('token', 'owner')).toThrow('not configured');
  });
});
