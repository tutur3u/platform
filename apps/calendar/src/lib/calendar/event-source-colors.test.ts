import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import { hydrateEventSourceColors } from './event-source-colors';

function query(data: unknown) {
  const chain = Object.assign(Promise.resolve({ data, error: null }), {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
  });
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  return chain;
}
it('keeps native event colors unchanged without querying provider accounts', async () => {
  const from = vi.fn();
  const events = [{ provider: 'tuturuuu', _calendarColor: 'GREEN' }];
  expect(
    await hydrateEventSourceColors({
      sbAdmin: { from } as unknown as TypedSupabaseClient,
      wsId: 'ws',
      userId: 'actor',
      events,
    })
  ).toBe(events);
  expect(from).not.toHaveBeenCalled();
});
describe('actor-scoped source RGB hydration', () => {
  it('uses only matching workspace/actor account source RGB', async () => {
    const tokens = query([{ id: 'token' }]);
    const connections = query([
      {
        calendar_id: 'source',
        workspace_calendar_id: 'native-source',
        color: '#D06B64',
      },
    ]);
    const from = vi
      .fn()
      .mockReturnValueOnce(tokens)
      .mockReturnValueOnce(connections);
    const result = await hydrateEventSourceColors({
      sbAdmin: { from } as unknown as TypedSupabaseClient,
      wsId: 'ws',
      userId: 'actor',
      events: [
        {
          provider: 'google',
          source_calendar_id: 'native-source',
          external_calendar_id: 'source',
        },
      ],
    });
    expect(result[0]).toMatchObject({ _calendarColor: '#d06b64' });
    expect(tokens.select).toHaveBeenCalledWith('id');
    expect(tokens.eq).toHaveBeenCalledWith('ws_id', 'ws');
    expect(tokens.eq).toHaveBeenCalledWith('user_id', 'actor');
    expect(tokens.eq).toHaveBeenCalledWith('provider', 'google');
    expect(tokens.eq).toHaveBeenCalledWith('is_active', true);
    expect(connections.eq).toHaveBeenCalledWith('ws_id', 'ws');
    expect(connections.eq).toHaveBeenCalledWith('provider', 'google');
    expect(connections.eq).toHaveBeenCalledWith('is_enabled', true);
    expect(connections.in).toHaveBeenCalledWith('auth_token_id', ['token']);
  });
  it('does not guess across ambiguous source accounts', async () => {
    const tokens = query([{ id: 'token' }]);
    const connections = query([
      {
        calendar_id: 'source',
        workspace_calendar_id: 'native-source',
        color: '#ffffff',
      },
      {
        calendar_id: 'source',
        workspace_calendar_id: 'native-source',
        color: '#000000',
      },
    ]);
    const from = vi
      .fn()
      .mockReturnValueOnce(tokens)
      .mockReturnValueOnce(connections);
    expect(
      (
        await hydrateEventSourceColors({
          sbAdmin: { from } as unknown as TypedSupabaseClient,
          wsId: 'ws',
          userId: 'actor',
          events: [
            {
              provider: 'google',
              source_calendar_id: 'native-source',
              external_calendar_id: 'source',
            },
          ],
        })
      )[0]
    ).not.toHaveProperty('_calendarColor');
  });
});

it('does not borrow an owned primary alias for an account-unbound legacy row', async () => {
  const from = vi
    .fn()
    .mockReturnValueOnce(query([{ id: 'viewer-token' }]))
    .mockReturnValueOnce(
      query([
        {
          calendar_id: 'primary',
          workspace_calendar_id: 'viewer-calendar',
          color: '#ff0000',
        },
      ])
    );
  const result = await hydrateEventSourceColors({
    sbAdmin: { from } as unknown as TypedSupabaseClient,
    wsId: 'ws',
    userId: 'viewer',
    events: [{ provider: 'google', external_calendar_id: 'primary' }],
  });
  expect(result[0]).not.toHaveProperty('_calendarColor');
});

for (const sourceCalendarId of [null, 'another-actor-source']) {
  it(`retains shared calendar snapshot for unmatched persisted source ${sourceCalendarId}`, async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(query([{ id: 'viewer-token' }]))
      .mockReturnValueOnce(
        query([
          {
            calendar_id: 'shared-calendar',
            workspace_calendar_id: 'viewer-source',
            color: '#ff0000',
          },
        ])
      );
    const event = {
      provider: 'google',
      source_calendar_id: sourceCalendarId,
      external_calendar_id: 'shared-calendar',
      _calendarColor: '#abcdef',
    };
    const result = await hydrateEventSourceColors({
      sbAdmin: { from } as unknown as TypedSupabaseClient,
      wsId: 'ws',
      userId: 'viewer',
      events: [event],
    });
    expect(result[0]).toBe(event);
    expect(result[0]?._calendarColor).toBe('#abcdef');
  });
}
