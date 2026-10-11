import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import {
  getTaskEmailSkipReason,
  TASK_EMAIL_MAX_OVERDUE_MS,
  TASK_EMAIL_OVERDUE_SKIP_REASON,
  TASK_EMAIL_UNAVAILABLE_SKIP_REASON,
} from './task-email-freshness';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const notification = {
  entity_type: 'task',
  entity_id: 'task-1',
  ws_id: 'workspace-1',
  data: { task_id: 'task-1', end_date: '2000-01-01' },
};
function client(
  endDate: string | null,
  overrides: Record<string, unknown> = {},
  error: unknown = null
) {
  const result = {
    data: {
      id: 'task-1',
      end_date: endDate,
      task_lists: { workspace_boards: { ws_id: 'workspace-1' } },
      ...overrides,
    },
    error,
  };
  const eq = vi.fn();
  const query = { eq, maybeSingle: vi.fn(async () => result) };
  eq.mockReturnValue(query);
  const from = vi.fn(() => ({ select: vi.fn(() => query) }));
  return { sb: { from } as unknown as TypedSupabaseClient, from, eq };
}

function lookupClient(data: unknown, error: unknown = null) {
  const query = {
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data, error })),
  };
  query.eq.mockReturnValue(query);
  return {
    from: vi.fn(() => ({ select: vi.fn(() => query) })),
  } as unknown as TypedSupabaseClient;
}

describe('task email current due-date freshness', () => {
  it.each([
    [-TASK_EMAIL_MAX_OVERDUE_MS - 1, TASK_EMAIL_OVERDUE_SKIP_REASON],
    [-TASK_EMAIL_MAX_OVERDUE_MS, null],
    [-TASK_EMAIL_MAX_OVERDUE_MS + 1, null],
    [TASK_EMAIL_MAX_OVERDUE_MS, null],
  ])('uses strict instant cutoff for offset %s', async (offset, expected) => {
    const { sb } = client(new Date(NOW + Number(offset)).toISOString());
    expect(await getTaskEmailSkipReason(sb, notification, NOW)).toBe(expected);
  });
  it('preserves no due date and does not trust stale payload due dates', async () => {
    expect(
      await getTaskEmailSkipReason(client(null).sb, notification, NOW)
    ).toBeNull();
    expect(
      await getTaskEmailSkipReason(
        client(new Date(NOW + 1000).toISOString()).sb,
        notification,
        NOW
      )
    ).toBeNull();
  });
  it('binds both task and workspace, including the returned tenant', async () => {
    const { sb, eq } = client(null);
    await getTaskEmailSkipReason(sb, notification, NOW);
    expect(eq.mock.calls).toEqual([
      ['id', 'task-1'],
      ['task_lists.workspace_boards.ws_id', 'workspace-1'],
    ]);
    await expect(
      getTaskEmailSkipReason(
        client(null, { task_lists: { workspace_boards: { ws_id: 'foreign' } } })
          .sb,
        notification,
        NOW
      )
    ).rejects.toThrow('unavailable');
  });
  it('fails closed for unknown lookup or invalid current date, without declaring overdue', async () => {
    for (const sb of [
      client(null, {}, new Error('lookup')).sb,
      client(null, { id: 'foreign' }).sb,
      client('invalid').sb,
      client(null, { task_lists: null }).sb,
    ]) {
      await expect(
        getTaskEmailSkipReason(sb, notification, NOW)
      ).rejects.toThrow();
    }
  });
  it('rejects missing or contradictory binding without querying', async () => {
    const { sb, from } = client(null);
    for (const candidate of [
      { ...notification, ws_id: null },
      { ...notification, entity_id: null },
      { ...notification, data: { task_id: 'different' } },
    ]) {
      await expect(getTaskEmailSkipReason(sb, candidate, NOW)).rejects.toThrow(
        'binding'
      );
    }
    expect(from).not.toHaveBeenCalled();
  });
  it('skips a confirmed absent task without claiming overdue', async () => {
    expect(
      await getTaskEmailSkipReason(lookupClient(null), notification, NOW)
    ).toBe(TASK_EMAIL_UNAVAILABLE_SKIP_REASON);
  });
  it.each([undefined, {}, false, { id: 'task-1', end_date: null }])(
    'fails closed for malformed or undefined lookup data %s',
    async (data) => {
      await expect(
        getTaskEmailSkipReason(lookupClient(data), notification, NOW)
      ).rejects.toThrow('unavailable');
    }
  );
  it('does not interpret a null row with a lookup error as known absence', async () => {
    await expect(
      getTaskEmailSkipReason(
        lookupClient(null, new Error('lookup')),
        notification,
        NOW
      )
    ).rejects.toThrow('unavailable');
  });
  it('leaves non-task notifications alone', async () => {
    const { sb, from } = client(null);
    expect(
      await getTaskEmailSkipReason(sb, { entity_type: 'mail_message' }, NOW)
    ).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});
