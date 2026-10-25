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
        { user: { id: 'owner' }, normalizedWsId: 'workspace' },
        provider,
        new Request(
          'https://mail.example.test/api/v1/workspaces/personal/mail/connected/connect'
        )
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
  it.each(['google', 'microsoft'] as const)(
    '%s starts on the mounted host using its registered callback and scoped state cookie',
    async (provider) => {
      const prefix = provider === 'google' ? 'GOOGLE' : 'MICROSOFT';
      vi.stubEnv(
        `MAIL_${prefix}_APEX_REDIRECT_URI`,
        'https://tuturuuu.com/mail/api/v1/mail/connected/callback'
      );
      const response = await startOAuth(
        { user: { id: 'owner' }, normalizedWsId: 'workspace' },
        provider,
        new Request(
          'https://tuturuuu.com/mail/api/v1/workspaces/personal/mail/connected/connect'
        )
      );
      const url = new URL((await response.json()).authUrl);
      expect(url.searchParams.get('redirect_uri')).toBe(
        'https://tuturuuu.com/mail/api/v1/mail/connected/callback'
      );
      expect(response.headers.get('set-cookie')).toContain(
        'Path=/mail/api/v1/mail/connected'
      );
    }
  );
  it('rejects an unregistered serving host before creating pending state', async () => {
    await expect(
      startOAuth(
        { user: { id: 'owner' }, normalizedWsId: 'workspace' },
        'google',
        new Request(
          'https://other.example.test/api/v1/workspaces/personal/mail/connected/connect'
        )
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('rejects mismatched, missing and different-length browser state', () => {
    expect(matchesState('abc', 'abc')).toBe(true);
    expect(matchesState('abc', 'xyz')).toBe(false);
    expect(matchesState('abc', undefined)).toBe(false);
    expect(matchesState('abc', 'abcd')).toBe(false);
  });
});
