import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import { loadTicketIdentifierTaskIds } from './load-ticket-identifier-task-ids';

function fixture(membershipError = false) {
  const calls: unknown[][] = [];
  const client = {
    from: vi.fn((table: string) => {
      const query = {
        select: vi.fn(() => query),
        order: vi.fn(() => query),
        eq: vi.fn((...args: unknown[]) => {
          calls.push([table, 'eq', ...args]);
          return query;
        }),
        in: vi.fn((...args: unknown[]) => {
          calls.push([table, 'in', ...args]);
          return query;
        }),
        range: vi.fn(async () => ({
          data:
            table === 'tasks'
              ? [{ id: 'legacy' }]
              : [{ task_id: 'project-ticket' }],
          error: null,
        })),
        // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable.
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data: [{ ws_id: 'source' }],
            error: membershipError ? new Error('failed') : null,
          }).then(resolve),
      };
      return query;
    }),
  };
  return { client: client as unknown as TypedSupabaseClient, calls };
}

describe('loadTicketIdentifierTaskIds', () => {
  it('unions current project and legacy board IDs within admitted/member workspaces', async () => {
    const { client, calls } = fixture();
    expect(
      await loadTicketIdentifierTaskIds(client, 'actor', 'personal', {
        displayNumber: 12,
        ticketPrefix: 'PLA',
      })
    ).toEqual(['project-ticket', 'legacy']);
    expect(calls).toContainEqual([
      'workspace_members',
      'eq',
      'user_id',
      'actor',
    ]);
    expect(calls).toContainEqual([
      'task_project_tasks',
      'in',
      'project.ws_id',
      ['personal', 'source'],
    ]);
    expect(calls).toContainEqual([
      'tasks',
      'in',
      'list.board.ws_id',
      ['personal', 'source'],
    ]);
    expect(calls).toContainEqual([
      'task_project_tasks',
      'eq',
      'ticket_number',
      12,
    ]);
    expect(calls).toContainEqual(['tasks', 'eq', 'display_number', 12]);
  });
  it('fails closed when membership lookup fails', async () => {
    const { client } = fixture(true);
    await expect(
      loadTicketIdentifierTaskIds(client, 'actor', 'personal', {
        displayNumber: 12,
        ticketPrefix: 'PLA',
      })
    ).rejects.toThrow('TICKET_MEMBERSHIP_LOOKUP_FAILED');
  });
});
