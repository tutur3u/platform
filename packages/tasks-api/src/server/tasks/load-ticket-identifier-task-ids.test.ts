import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import { loadTicketIdentifierTaskIds } from './load-ticket-identifier-task-ids';

function fixture(membershipError = false, rpcError?: string) {
  const calls: unknown[][] = [];
  const rpc = vi.fn(() => ({
    order: vi.fn(() => ({
      range: vi.fn(async () => ({
        data: rpcError ? null : [{ id: 'retained-board-ticket' }],
        error: rpcError ? { code: rpcError } : null,
      })),
    })),
  }));
  const client = {
    schema: vi.fn(() => ({ rpc })),
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
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data: [{ ws_id: 'source' }],
            error: membershipError ? new Error('failed') : null,
          }).then(resolve),
      };
      return query;
    }),
  };
  return { client: client as unknown as TypedSupabaseClient, calls, rpc };
}

describe('loadTicketIdentifierTaskIds', () => {
  it('unions current project and retained board IDs within admitted workspaces', async () => {
    const { client, calls, rpc } = fixture();
    expect(
      await loadTicketIdentifierTaskIds(client, 'actor', 'personal', {
        displayNumber: 12,
        ticketPrefix: 'PLA',
      })
    ).toEqual(['project-ticket', 'retained-board-ticket']);
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
    expect(rpc).toHaveBeenCalledWith('list_board_task_ids_by_ticket_prefix', {
      p_display_number: 12,
      p_ticket_prefix: 'PLA',
      p_workspace_ids: ['personal', 'source'],
    });
    expect(calls).toContainEqual([
      'task_project_tasks',
      'eq',
      'ticket_number',
      12,
    ]);
  });

  it('falls back to the direct board lookup while the migration is pending', async () => {
    const { client, calls } = fixture(false, 'PGRST202');
    expect(
      await loadTicketIdentifierTaskIds(client, 'actor', 'personal', {
        displayNumber: 12,
        ticketPrefix: 'F',
      })
    ).toEqual(['project-ticket', 'legacy']);
    expect(calls).toContainEqual(['tasks', 'eq', 'display_number', 12]);
    expect(calls).toContainEqual([
      'tasks',
      'eq',
      'list.board.ticket_prefix',
      'F',
    ]);
  });

  it('fails closed when the retained board lookup is denied', async () => {
    const { client, calls } = fixture(false, '42501');
    await expect(
      loadTicketIdentifierTaskIds(client, 'actor', 'personal', {
        displayNumber: 12,
        ticketPrefix: 'F',
      })
    ).rejects.toThrow('TICKET_IDENTIFIER_LOOKUP_FAILED');
    expect(calls.some(([table]) => table === 'tasks')).toBe(false);
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
