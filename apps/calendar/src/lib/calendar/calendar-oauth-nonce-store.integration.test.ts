// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { consumeCalendarOAuthNonce } from './calendar-oauth-nonce-store';

// Runs only against a disposable local Supabase with the migrations applied.
// See apps/docs/platform/applications/calendar.mdx (Calendar OAuth And
// Connections) for the setup; never point these at a shared or remote project.
const url = process.env.CALENDAR_OAUTH_NONCE_IT_SUPABASE_URL;
const serviceRoleKey = process.env.CALENDAR_OAUTH_NONCE_IT_SERVICE_ROLE_KEY;
const userId = process.env.CALENDAR_OAUTH_NONCE_IT_USER_ID;

function freshNonce() {
  return randomBytes(16).toString('base64url');
}

describe.skipIf(!url || !serviceRoleKey || !userId)(
  'calendar OAuth nonce ledger against a local Supabase',
  () => {
    beforeAll(() => {
      vi.stubEnv('SUPABASE_SERVER_URL', url ?? '');
      vi.stubEnv('SUPABASE_SECRET_KEY', serviceRoleKey ?? '');
    });

    afterAll(() => {
      vi.unstubAllEnvs();
    });

    it('consumes a nonce once and rejects every replay', async () => {
      const input = {
        expiresAt: Date.now() + 10 * 60 * 1000,
        nonce: freshNonce(),
        provider: 'google' as const,
        userId: userId ?? '',
      };

      await expect(consumeCalendarOAuthNonce(input)).resolves.toBe('consumed');
      await expect(consumeCalendarOAuthNonce(input)).resolves.toBe('replayed');
      await expect(
        consumeCalendarOAuthNonce({ ...input, provider: 'microsoft' })
      ).resolves.toBe('replayed');
    });

    it('admits exactly one of several concurrent consumers', async () => {
      const input = {
        expiresAt: Date.now() + 10 * 60 * 1000,
        nonce: freshNonce(),
        provider: 'microsoft' as const,
        userId: userId ?? '',
      };

      const results = await Promise.all(
        Array.from({ length: 8 }, () => consumeCalendarOAuthNonce(input))
      );

      expect(results.filter((result) => result === 'consumed')).toHaveLength(1);
      expect(results.filter((result) => result === 'replayed')).toHaveLength(7);
    });

    it('fails closed for expired or implausible expiries', async () => {
      const spy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      for (const expiresAt of [
        Date.now() - 1000,
        Date.now() + 60 * 60 * 1000,
      ]) {
        await expect(
          consumeCalendarOAuthNonce({
            expiresAt,
            nonce: freshNonce(),
            provider: 'google',
            userId: userId ?? '',
          })
        ).resolves.toBe('unavailable');
      }

      spy.mockRestore();
    });
  }
);
