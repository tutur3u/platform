import { describe, expect, it } from 'vitest';
import { dedupeNotifications, type Notification } from '../use-notifications';

describe('dedupeNotifications', () => {
  it('removes duplicate notification ids while preserving order', () => {
    const notifications: Notification[] = [
      {
        id: 'notification-1',
        ws_id: null,
        user_id: 'user-1',
        type: 'workspace_invite',
        title: 'Invite',
        description: null,
        data: {},
        entity_type: 'workspace_invite',
        entity_id: 'workspace-1',
        read_at: null,
        created_at: '2026-03-12T00:00:00.000Z',
        created_by: null,
        actor: null,
      },
      {
        id: 'notification-1',
        ws_id: null,
        user_id: 'user-1',
        type: 'workspace_invite',
        title: 'Invite duplicate',
        description: null,
        data: {},
        entity_type: 'workspace_invite',
        entity_id: 'workspace-1',
        read_at: null,
        created_at: '2026-03-12T00:01:00.000Z',
        created_by: null,
        actor: null,
      },
      {
        id: 'notification-2',
        ws_id: 'workspace-2',
        user_id: 'user-1',
        type: 'task_updated',
        title: 'Task updated',
        description: null,
        data: {},
        entity_type: 'task',
        entity_id: 'task-1',
        read_at: null,
        created_at: '2026-03-12T00:02:00.000Z',
        created_by: null,
        actor: null,
      },
    ];

    expect(dedupeNotifications(notifications)).toEqual([
      notifications[0],
      notifications[2],
    ]);
  });
});
