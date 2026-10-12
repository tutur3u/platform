import { createClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types';
import { describe, expect, it, vi } from 'vitest';
import { getTaskReminderSkipReason } from './task-reminder-lifecycle';

const due = '2026-10-13T12:00:00Z';
const reminder = {
  type: 'deadline_reminder',
  scope: 'workspace',
  entity_type: 'task',
  entity_id: 'task-1',
  ws_id: 'workspace-1',
  user_id: 'user-1',
  data: { task_id: 'task-1', end_date: due },
};
const task = {
  id: 'task-1',
  end_date: due,
  completed_at: null,
  closed_at: null,
  deleted_at: null,
  task_lists: { status: 'active', workspace_boards: { ws_id: 'workspace-1' } },
  task_watchers: [{ user_id: 'user-1' }],
};
function client(data: unknown = task, status = 200) {
  const fetch = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
  );
  const sb = createClient<Database>(
    'https://synthetic.supabase.test',
    'synthetic-key',
    {
      global: { fetch },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
  return { sb, fetch };
}

describe('deadline reminder dispatch lookup', () => {
  it('uses the real SDK to bind current task and workspace filters', async () => {
    const { sb, fetch } = client();
    expect(await getTaskReminderSkipReason(sb, reminder)).toBeNull();
    const request = fetch.mock.calls[0];
    expect(request).toBeDefined();
    // Fetch arguments are inspected through the SDK request, not a mocked query chain.
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/rest/v1/tasks');
    expect(url.searchParams.get('id')).toBe('eq.task-1');
    expect(url.searchParams.get('task_lists.workspace_boards.ws_id')).toBe(
      'eq.workspace-1'
    );
    expect(url.searchParams.get('select')).toContain('task_watchers(user_id)');
  });
  it.each([
    [null, 'skipped: task_reminder_canceled'],
    [[], 'skipped: task_reminder_canceled'],
    [{ ...task, end_date: null }, 'skipped: task_reminder_canceled'],
    [{ ...task, completed_at: due }, 'skipped: task_reminder_canceled'],
    [
      { ...task, end_date: '2026-10-14T12:00:00Z' },
      'skipped: task_reminder_revised',
    ],
    [{ ...task, task_watchers: [] }, 'skipped: task_reminder_unwatched'],
  ])('skips only confirmed lifecycle state', async (data, reason) => {
    expect(await getTaskReminderSkipReason(client(data).sb, reminder)).toBe(
      reason
    );
  });
  it('fails closed on lookup errors, malformed rows and tenant mismatches', async () => {
    for (const data of [
      'malformed',
      {},
      { ...task, id: 'foreign' },
      {
        ...task,
        task_lists: {
          status: 'active',
          workspace_boards: { ws_id: 'foreign' },
        },
      },
      { ...task, task_watchers: null },
    ]) {
      await expect(
        getTaskReminderSkipReason(client(data).sb, reminder)
      ).rejects.toThrow('unavailable');
    }
    await expect(
      getTaskReminderSkipReason(
        client({ message: 'unavailable' }, 500).sb,
        reminder
      )
    ).rejects.toThrow('unavailable');
  });
  it('rejects contradictory or missing bindings before lookup', async () => {
    const { sb, fetch } = client();
    for (const patch of [
      { ws_id: null },
      { user_id: null },
      { entity_type: 'event' },
      { scope: 'user' },
      { data: {} },
      { data: { task_id: 'foreign', end_date: due } },
    ]) {
      await expect(
        getTaskReminderSkipReason(sb, { ...reminder, ...patch })
      ).rejects.toThrow('binding');
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('leaves ordinary task events outside reminder cancellation semantics', async () => {
    const { sb, fetch } = client();
    expect(
      await getTaskReminderSkipReason(sb, { type: 'task_updated' })
    ).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
