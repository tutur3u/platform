import { describe, expect, it, vi } from 'vitest';
import {
  prepareWorkspaceTaskRecurrence,
  readWorkspaceTaskRecurrence,
} from './task-recurrence';

const options = (status: number, body: unknown) => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  );
  return { fetch, options: { baseUrl: 'https://tasks.example.com', fetch } };
};

describe('task recurrence client', () => {
  it('posts prepare to the workspace recurrence route', async () => {
    const { fetch, options: opts } = options(200, { receipt: 'r' });
    await expect(
      prepareWorkspaceTaskRecurrence('ws-1', 'list-1', opts)
    ).resolves.toBe('r');
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://tasks.example.com/api/v1/workspaces/ws-1/tasks/recurrence'
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ operation: 'prepare', listId: 'list-1' }),
    });
  });

  it('treats the dormant 404 as unavailable instead of an error', async () => {
    const body = { error: 'TASK_RECURRENCE_UNAVAILABLE' };
    await expect(
      prepareWorkspaceTaskRecurrence(
        'ws-1',
        'list-1',
        options(404, body).options
      )
    ).resolves.toBeNull();
    await expect(
      readWorkspaceTaskRecurrence(
        'ws-1',
        ['t'],
        false,
        options(404, body).options
      )
    ).resolves.toEqual([]);
  });

  it('surfaces other failures and bounds reads', async () => {
    await expect(
      prepareWorkspaceTaskRecurrence(
        'ws-1',
        'list-1',
        options(500, { error: 'TASK_RECURRENCE_FAILED' }).options
      )
    ).rejects.toThrow();
    const { fetch, options: opts } = options(200, []);
    await expect(
      readWorkspaceTaskRecurrence('ws-1', [], false, opts)
    ).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      readWorkspaceTaskRecurrence(
        'ws-1',
        Array.from({ length: 101 }, (_, i) => String(i)),
        false,
        opts
      )
    ).rejects.toThrow(RangeError);
  });
});
