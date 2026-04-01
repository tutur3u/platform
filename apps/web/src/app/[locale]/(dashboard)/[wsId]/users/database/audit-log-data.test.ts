import { describe, expect, it } from 'vitest';
import {
  buildLegacyStatusEvents,
  type LegacyStatusChangeRow,
} from './audit-log-data';

describe('buildLegacyStatusEvents', () => {
  it('keeps unmatched legacy status rows as first-class archive timing events', () => {
    const rows: LegacyStatusChangeRow[] = [
      {
        user_id: 'user-1',
        archived: true,
        archived_until: '2026-03-10T00:00:00.000Z',
        creator_id: 'workspace-user-actor-1',
        actor_auth_uid: null,
        source: 'live',
        audit_record_version_id: null,
        created_at: '2026-03-01T00:00:00.000Z',
      },
      {
        user_id: 'user-1',
        archived: true,
        archived_until: '2026-03-15T00:00:00.000Z',
        creator_id: 'workspace-user-actor-1',
        actor_auth_uid: null,
        source: 'live',
        audit_record_version_id: null,
        created_at: '2026-03-05T00:00:00.000Z',
      },
    ];

    const events = buildLegacyStatusEvents({
      rows,
      affectedUsers: new Map([
        [
          'user-1',
          {
            id: 'user-1',
            name: 'Alice Example',
            email: 'alice@example.com',
          },
        ],
      ]),
      authActors: new Map(),
      workspaceUsers: new Map([
        [
          'workspace-user-actor-1',
          {
            id: 'workspace-user-actor-1',
            name: 'Manager Example',
            email: 'manager@example.com',
          },
        ],
      ]),
    });

    expect(events).toHaveLength(2);
    expect(events[0]?.eventKind).toBe('archived');
    expect(events[1]?.eventKind).toBe('archive_until_changed');
    expect(events[1]?.actor.workspaceUserId).toBe('workspace-user-actor-1');
    expect(events[1]?.changedFields).toEqual(['archived_until']);
  });
});
