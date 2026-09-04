import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getRunningTaskTimeTrackingSession,
  startTaskTimeTrackingSession,
  stopTaskTimeTrackingSession,
} from './task-time-tracking-api';

function jsonResponse(payload: unknown) {
  return {
    json: async () => payload,
    ok: true,
    status: 200,
  };
}

describe('task time tracking API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the current running session from the canonical endpoint', async () => {
    const session = { id: 'session-1', task_id: 'task-1' };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ session }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getRunningTaskTimeTrackingSession('source workspace')
    ).resolves.toEqual(session);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspaces/source%20workspace/time-tracking/sessions?type=running',
      expect.objectContaining({ cache: 'no-store', method: 'GET' })
    );
  });

  it('starts personal task tracking through the normalized sessions route', async () => {
    const session = { id: 'session-1', task_id: 'task-1' };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ session }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      startTaskTimeTrackingSession('personal', {
        taskId: 'task-1',
        taskName: 'Prepare launch',
        description: 'Launch checklist',
      })
    ).resolves.toEqual(session);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspaces/personal/time-tracking/sessions',
      expect.objectContaining({
        body: JSON.stringify({
          title: 'Working on: Prepare launch',
          description: 'Launch checklist',
          categoryId: null,
          taskId: 'task-1',
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });

  it('stops the selected running task through its session route', async () => {
    const session = { id: 'session-1', is_running: false, task_id: 'task-1' };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ session }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      stopTaskTimeTrackingSession('source workspace', 'session-1')
    ).resolves.toEqual(session);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspaces/source%20workspace/time-tracking/sessions/session-1',
      expect.objectContaining({
        body: JSON.stringify({ action: 'stop' }),
        cache: 'no-store',
        method: 'PATCH',
      })
    );
  });
});
