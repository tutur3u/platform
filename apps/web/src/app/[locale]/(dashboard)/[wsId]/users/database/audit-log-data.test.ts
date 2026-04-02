import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
}));

import {
  buildLegacyStatusEvents,
  getAuditLogView,
  type LegacyStatusChangeRow,
} from './audit-log-data';

describe('buildLegacyStatusEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('loads the dashboard view through a single exact-count rpc', async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: {
        count: 3,
        rows: [
          {
            audit_record_id: 30,
            event_kind: 'archived',
            occurred_at: '2026-03-10T10:00:00.000Z',
            source: 'live',
            affected_user_id: 'user-1',
            affected_user_name: 'Alice Example',
            affected_user_email: 'alice@example.com',
            actor_auth_uid: 'actor-1',
            actor_workspace_user_id: 'workspace-actor-1',
            actor_id: 'actor-1',
            actor_name: 'Manager Example',
            actor_email: 'manager@example.com',
            changed_fields: ['archived'],
            before: { archived: false },
            after: { archived: true },
          },
        ],
        summary: {
          total_events: 3,
          archived_events: 1,
          reactivated_events: 1,
          archive_timing_events: 0,
          archive_related_events: 2,
          profile_updates: 1,
          affected_users_count: 2,
          top_actor_name: 'Manager Example',
          top_actor_count: 2,
        },
        buckets: [
          {
            bucket_key: '2026-03-10',
            total_count: 2,
            archived_count: 1,
            reactivated_count: 1,
            archive_timing_count: 0,
            profile_update_count: 0,
          },
          {
            bucket_key: '2026-03-11',
            total_count: 1,
            archived_count: 0,
            reactivated_count: 0,
            archive_timing_count: 0,
            profile_update_count: 1,
          },
        ],
      },
      error: null,
    });
    createAdminClientMock.mockResolvedValue({
      rpc: rpcMock,
    });

    const view = await getAuditLogView({
      wsId: 'ws-1',
      locale: 'en',
      period: 'monthly',
      month: '2026-03',
      eventKind: 'all',
      source: 'all',
      page: 2,
      pageSize: 1,
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith(
      'get_workspace_user_audit_view',
      expect.objectContaining({
        p_ws_id: 'ws-1',
        p_period: 'monthly',
        p_limit: 1,
        p_offset: 1,
      })
    );
    expect(view.count).toBe(3);
    expect(view.data).toHaveLength(1);
    expect(view.summary.totalEvents).toBe(3);
    expect(view.summary.peakBucketCount).toBe(2);
    expect(view.chartStats).toHaveLength(31);
  });
});
