import { describe, expect, it } from 'vitest';

import { handleEditAction } from '../legacy-api-routes/v1/workspaces/[wsId]/time-tracking/sessions/[sessionId]/actions/edit';
import type { SessionRecord } from '../legacy-api-routes/v1/workspaces/[wsId]/time-tracking/sessions/[sessionId]/schemas';

const baseSession = {
  id: 'session-1',
  ws_id: 'workspace-1',
  user_id: 'user-1',
  title: 'Work session',
  description: null,
  category_id: null,
  task_id: null,
  start_time: '2024-01-01T09:00:00.000Z',
  end_time: '2024-01-01T10:00:00.000Z',
  duration_seconds: 3600,
  is_running: false,
  created_at: '2024-01-01T09:00:00.000Z',
  updated_at: '2024-01-01T10:00:00.000Z',
} as SessionRecord;

describe('handleEditAction interval validation', () => {
  it('rejects updating only startTime when new start is after existing end', async () => {
    const response = await handleEditAction({
      sbAdmin: {} as never,
      session: baseSession,
      sessionId: baseSession.id,
      normalizedWsId: baseSession.ws_id,
      canBypass: true,
      requestBody: {
        action: 'edit',
        startTime: '2024-01-01T11:00:00.000Z',
      },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'startTime must be before endTime',
    });
  });

  it('rejects updating only endTime when new end is before existing start', async () => {
    const response = await handleEditAction({
      sbAdmin: {} as never,
      session: baseSession,
      sessionId: baseSession.id,
      normalizedWsId: baseSession.ws_id,
      canBypass: true,
      requestBody: {
        action: 'edit',
        endTime: '2024-01-01T08:00:00.000Z',
      },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'startTime must be before endTime',
    });
  });
});
