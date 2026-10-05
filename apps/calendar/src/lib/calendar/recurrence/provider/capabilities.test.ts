import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { providerSeriesCapabilities } from './capabilities';

function fixture(
  overrides: {
    role?: string | null;
    enabledCalendar?: boolean;
    provider?: string;
    limit?: boolean;
    error?: boolean;
  } = {}
) {
  const select = vi.fn(),
    eq = vi.fn(),
    queries: string[] = [];
  const rows: Record<string, unknown[]> = {
    calendar_auth_tokens: overrides.limit
      ? Array(251).fill({ id: 'token', provider: 'google' })
      : [{ id: 'token', provider: 'google' }],
    calendar_connections: [
      {
        id: 'connection',
        provider: overrides.provider ?? 'google',
        auth_token_id: 'token',
        calendar_name: 'Test Calendar',
        access_role: overrides.role === undefined ? 'owner' : overrides.role,
        workspace_calendar_id: 'calendar',
        access_token: 'must-never-escape',
      },
    ],
    workspace_calendars:
      overrides.enabledCalendar === false ? [] : [{ id: 'calendar' }],
  };
  function from(table: string) {
    queries.push(table);
    const chain = {
      select: (...args: unknown[]) => {
        select(...args);
        return chain;
      },
      eq: (...args: unknown[]) => {
        eq(...args);
        return chain;
      },
      in: () => chain,
      order: () => chain,
      limit: () =>
        Promise.resolve({
          data: rows[table],
          error: overrides.error ? { private: 'secret' } : null,
        }),
    };
    return chain;
  }
  const sbAdmin = {
    from,
    schema: () => ({ from }),
  } as unknown as TypedSupabaseClient;
  return {
    access: { sbAdmin, wsId: 'workspace', userId: 'actor' },
    eq,
    select,
    queries,
  };
}
beforeEach(() =>
  vi.stubEnv('CALENDAR_PROVIDER_SERIES_OPERATIONS_ENABLED', 'true')
);
describe('provider recurrence configuration capabilities', () => {
  it('returns disabled without touching provider credentials', async () => {
    vi.stubEnv('CALENDAR_PROVIDER_SERIES_OPERATIONS_ENABLED', 'false');
    const f = fixture();
    expect(await providerSeriesCapabilities(f.access)).toEqual({
      enabled: false,
      sources: [],
    });
    expect(f.queries).toEqual([]);
  });
  it('scopes connections to the current actor and exposes only safe source labels', async () => {
    const f = fixture();
    expect(await providerSeriesCapabilities(f.access)).toEqual({
      enabled: true,
      sources: [
        {
          provider: 'google',
          connectionId: 'connection',
          label: 'Test Calendar',
        },
      ],
    });
    expect(f.eq).toHaveBeenCalledWith('ws_id', 'workspace');
    expect(f.eq).toHaveBeenCalledWith('user_id', 'actor');
    expect(f.eq).toHaveBeenCalledWith('sync_outbound_enabled', true);
    expect(f.select.mock.calls.flat().join()).not.toContain('access_token');
  });
  it.each([null, '', 'reader', 'freeBusyReader'])(
    'requires an explicit writable role (%s)',
    async (role) => {
      expect(
        (await providerSeriesCapabilities(fixture({ role }).access)).sources
      ).toEqual([]);
    }
  );
  it.each([{ enabledCalendar: false }, { provider: 'microsoft' }])(
    'rejects disabled calendar or credential-provider mismatch',
    async (options) => {
      expect(
        (await providerSeriesCapabilities(fixture(options).access)).sources
      ).toEqual([]);
    }
  );
  it.each([{ error: true }, { limit: true }])(
    'fails closed on failed or truncated authorization reads',
    async (options) => {
      await expect(
        providerSeriesCapabilities(fixture(options).access)
      ).rejects.toMatchObject({ status: 503, code: 'SOURCE_UNAVAILABLE' });
    }
  );
});
