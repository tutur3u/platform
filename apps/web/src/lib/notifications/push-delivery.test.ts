import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { buildPushData, buildPushOpenTarget } from './push-delivery';

describe('push delivery helpers', () => {
  it('builds task deep-link payloads when board and task metadata exist', () => {
    const notification = {
      created_at: '2026-03-28T00:00:00.000Z',
      data: {
        board_id: 'board-1',
        workspace_id: 'ws-1',
      },
      entity_id: 'task-1',
      entity_type: 'task',
      id: 'notification-1',
      title: 'Task mentioned',
      type: 'task_mention',
      ws_id: 'ws-1',
      description: 'Someone mentioned you',
    };

    expect(buildPushOpenTarget(notification)).toBe('task');
    expect(buildPushData(notification)).toMatchObject({
      boardId: 'board-1',
      entityId: 'task-1',
      entityType: 'task',
      notificationId: 'notification-1',
      openTarget: 'task',
      wsId: 'ws-1',
    });
  });

  it('falls back to inbox when a notification cannot open a specific task route', () => {
    const notification = {
      created_at: '2026-03-28T00:00:00.000Z',
      data: {
        workspace_id: 'ws-2',
      },
      entity_id: null,
      entity_type: 'workspace',
      id: 'notification-2',
      title: 'Security alert',
      type: 'security_alert',
      ws_id: null,
      description: 'Suspicious sign-in detected',
    };

    expect(buildPushOpenTarget(notification)).toBe('inbox');
    expect(buildPushData(notification)).toMatchObject({
      boardId: '',
      entityId: '',
      openTarget: 'inbox',
      wsId: 'ws-2',
    });
  });
});
