import type { SupabaseClient } from '@tuturuuu/supabase';
import { expect, it } from 'vitest';
import { resolveCalendarSourceForEvent } from './source-resolver';

function fixture() {
  const rows: Record<string, unknown[]> = {
    calendar_auth_tokens: [
      {
        id: 'token',
        user_id: 'actor',
        ws_id: 'workspace',
        provider: 'google',
        access_token: 'fixture',
        is_active: true,
      },
    ],
    calendar_connections: ['wrong', 'correct'].map((calendar, index) => ({
      id: calendar,
      ws_id: 'workspace',
      calendar_id: calendar,
      calendar_name: calendar,
      provider: 'google',
      workspace_calendar_id: 'local',
      auth_token_id: 'token',
      access_role: 'writer',
      is_enabled: true,
      created_at: String(index),
    })),
  };
  const client = {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () =>
          table === 'calendar_auth_tokens'
            ? Promise.resolve({ data: rows[table], error: null })
            : query,
        order: async () => ({ data: rows[table], error: null }),
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { sbAdmin: client, wsId: 'workspace', userId: 'actor' };
}
it('matches both local source and external calendar instead of the oldest shared source', async () => {
  const args = fixture();
  const source = await resolveCalendarSourceForEvent({
    ...args,
    event: {
      provider: 'google',
      source_calendar_id: 'local',
      external_calendar_id: 'correct',
    },
  });
  expect(source).toMatchObject({
    connectionId: 'correct',
    externalCalendarId: 'correct',
  });
});
it('does not resolve an external calendar from a different local source', async () => {
  await expect(
    resolveCalendarSourceForEvent({
      ...fixture(),
      event: {
        provider: 'google',
        source_calendar_id: 'foreign',
        external_calendar_id: 'correct',
      },
    })
  ).rejects.toThrow('unavailable');
});
