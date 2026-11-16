import type { TaskWithRelations } from '@tuturuuu/types';
import { describe, expect, it, vi } from 'vitest';
import {
  completeCurrentUserTask,
  TaskCompletionUnavailableError,
} from './tasks-dashboard';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });

const options = (fetch: ReturnType<typeof vi.fn>) => ({
  baseUrl: 'https://tasks.example.com',
  fetch,
});

const task = (extra: Partial<TaskWithRelations> = {}) =>
  ({
    id: 'task-1',
    name: 'Ship it',
    list: { id: 'l-todo', status: 'active', board: { id: 'b-1', ws_id: 'ws-1' } },
    overrides: null,
    ...extra,
  }) as unknown as TaskWithRelations;

const calls = (fetch: ReturnType<typeof vi.fn>) =>
  fetch.mock.calls.map(([input, init]) => [
    String(init?.method ?? 'GET'),
    new URL(String(input)).pathname,
    init?.body ? JSON.parse(String(init.body)) : undefined,
  ]);

describe('completeCurrentUserTask', () => {
  it('moves a board task to the list whose status is done', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          lists: [
            { id: 'l-todo', status: 'active' },
            { id: 'l-done', status: 'done' },
          ],
        })
      )
      .mockResolvedValueOnce(json({ task: { id: 'task-1' } }));

    await expect(completeCurrentUserTask(task(), options(fetch))).resolves.toBe(
      'done_list'
    );
    expect(calls(fetch)).toEqual([
      ['GET', '/api/v1/workspaces/ws-1/task-boards/b-1/lists', undefined],
      ['PUT', '/api/v1/workspaces/ws-1/tasks/task-1', { list_id: 'l-done' }],
    ]);
  });

  it('records a personal completion for self-managed tasks only', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ data: {} }));
    const now = new Date('2026-11-16T12:00:00.000Z');
    vi.useFakeTimers({ now });

    await expect(
      completeCurrentUserTask(
        task({ overrides: { self_managed: true } as TaskWithRelations['overrides'] }),
        options(fetch)
      )
    ).resolves.toBe('personal_completion');
    vi.useRealTimers();

    expect(calls(fetch)).toEqual([
      [
        'PUT',
        '/api/v1/users/me/tasks/task-1/overrides',
        { completed_at: '2026-11-16T12:00:00.000Z' },
      ],
    ]);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
  });

  it('completes a personal placement and clears a stale personal completion', async () => {
    const fetch = vi.fn().mockResolvedValue(json({}));

    await completeCurrentUserTask(
      task({
        overrides: {
          personal_board_id: 'pb-1',
          personal_list_id: 'pl-1',
          completed_at: '2026-11-01T00:00:00.000Z',
        } as TaskWithRelations['overrides'],
      }),
      options(fetch)
    );

    expect(calls(fetch)).toEqual([
      [
        'PUT',
        '/api/v1/users/me/tasks/task-1/personal-placement',
        { personal_board_id: 'pb-1', personal_list_id: 'pl-1', terminal_status: 'done' },
      ],
      [
        'PUT',
        '/api/v1/users/me/tasks/task-1/overrides',
        { completed_at: null, personally_unassigned: false },
      ],
    ]);
  });

  it('refuses without guessing when no list is marked done', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ lists: [{ id: 'l-todo', status: 'active' }] }));

    await expect(completeCurrentUserTask(task(), options(fetch))).rejects.toEqual(
      new TaskCompletionUnavailableError('done_list_missing')
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('never writes for tasks the user handed off or that have no board', async () => {
    const fetch = vi.fn();
    await expect(
      completeCurrentUserTask(
        task({ overrides: { personally_unassigned: true } as TaskWithRelations['overrides'] }),
        options(fetch)
      )
    ).rejects.toMatchObject({ reason: 'unassigned' });
    await expect(
      completeCurrentUserTask(task({ list: null } as Partial<TaskWithRelations>), options(fetch))
    ).rejects.toMatchObject({ reason: 'not_on_board' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
