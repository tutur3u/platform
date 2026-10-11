import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ insert: vi.fn(), table: vi.fn() }));
vi.mock('./repository', () => ({ table: mocks.table, exchangeToken: vi.fn() }));

import { unseal } from './crypto';
import { hashState, matchesState, startOAuth } from './oauth';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('MAIL_CONNECTED_ACCOUNTS_KEY', 'a'.repeat(64));
  for (const provider of ['GOOGLE', 'MICROSOFT']) {
    vi.stubEnv(`MAIL_${provider}_CLIENT_ID`, 'client');
    vi.stubEnv(`MAIL_${provider}_CLIENT_SECRET`, 'secret');
    vi.stubEnv(
      `MAIL_${provider}_REDIRECT_URI`,
      'https://mail.example.test/api/v1/mail/connected/callback'
    );
  }
  mocks.table.mockResolvedValue({ insert: mocks.insert });
  mocks.insert.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe('mail OAuth authorization', () => {
  it.each(['google', 'microsoft'] as const)(
    '%s binds state to actor, browser, workspace and a PKCE verifier',
    async (provider) => {
      const response = await startOAuth(
        { user: { id: 'owner' }, normalizedWsId: 'workspace' } as any,
        provider
      );
      const url = new URL((await response.json()).authUrl);
      const row = mocks.insert.mock.calls[0]?.[0];
      expect(row).toMatchObject({
        user_id: 'owner',
        ws_id: 'workspace',
        provider,
        state_hash: hashState(url.searchParams.get('state')!),
      });
      expect(unseal(row.verifier, 'owner')).toHaveLength(43);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('scope')).toContain(
        provider === 'google' ? 'gmail.modify' : 'Mail.Send'
      );
      expect(response.headers.get('set-cookie')).toContain('HttpOnly');
      expect(response.headers.get('set-cookie')).toContain('SameSite=lax');
      expect(url.searchParams.has('client_secret')).toBe(false);
    }
  );
  it('rejects mismatched, missing and different-length browser state', () => {
    expect(matchesState('abc', 'abc')).toBe(true);
    expect(matchesState('abc', 'xyz')).toBe(false);
    expect(matchesState('abc', undefined)).toBe(false);
    expect(matchesState('abc', 'abcd')).toBe(false);
  });
});
