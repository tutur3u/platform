import { describe, expect, it, vi } from 'vitest';
import { updateCurrentUserTaskSchedulingSettings } from './tasks-scheduling';

function createJsonResponse(payload: unknown) {
  return {
    json: async () => payload,
    ok: true,
    status: 200,
  };
}

describe('task scheduling internal API helpers', () => {
  it('updates current-user scheduling settings without a workspace-scoped URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        ok: true,
        task_ws_id: 'workspace-1',
      })
    );

    const payload = {
      total_duration: 2,
      is_splittable: false,
      min_split_duration_minutes: null,
      max_split_duration_minutes: null,
      calendar_hours: 'work_hours' as const,
      auto_schedule: false,
    };

    const result = await updateCurrentUserTaskSchedulingSettings(
      'task-1',
      payload,
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/users/me/tasks/task-1/schedule',
      expect.objectContaining({
        method: 'PATCH',
        cache: 'no-store',
        body: JSON.stringify(payload),
        headers: expect.any(Headers),
      })
    );
    expect(result).toEqual({ ok: true, task_ws_id: 'workspace-1' });
  });
});
