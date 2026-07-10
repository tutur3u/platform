import { describe, expect, it } from 'vitest';
import {
  classifyWorkspaceUserAuditEvent,
  filterWorkspaceUserAuditEvents,
  normalizeWorkspaceUserAuditEvent,
  summarizeWorkspaceUserAuditEvents,
  type WorkspaceUserAuditEvent,
  type WorkspaceUserAuditRecordRow,
} from './normalize';

function createUpdateRow(
  overrides: Partial<WorkspaceUserAuditRecordRow> = {}
): WorkspaceUserAuditRecordRow {
  return {
    audit_record_id: 1,
    op: 'UPDATE',
    ts: '2026-03-10T10:00:00.000Z',
    ws_id: 'ws-1',
    auth_uid: 'actor-1',
    auth_role: 'authenticated',
    record: {
      id: 'user-1',
      ws_id: 'ws-1',
      archived: true,
      archived_until: null,
      full_name: 'New Name',
    },
    old_record: {
      id: 'user-1',
      ws_id: 'ws-1',
      archived: false,
      archived_until: null,
      full_name: 'Old Name',
    },
    ...overrides,
  };
}

describe('workspace user audit normalization', () => {
  it('classifies archive-related updates correctly', () => {
    expect(classifyWorkspaceUserAuditEvent(createUpdateRow())).toBe('archived');

    expect(
      classifyWorkspaceUserAuditEvent(
        createUpdateRow({
          record: {
            id: 'user-1',
            ws_id: 'ws-1',
            archived: false,
            archived_until: null,
          },
          old_record: {
            id: 'user-1',
            ws_id: 'ws-1',
            archived: true,
            archived_until: '2026-03-12T00:00:00.000Z',
          },
        })
      )
    ).toBe('reactivated');

    expect(
      classifyWorkspaceUserAuditEvent(
        createUpdateRow({
          record: {
            id: 'user-1',
            ws_id: 'ws-1',
            archived: true,
            archived_until: '2026-03-14T00:00:00.000Z',
          },
          old_record: {
            id: 'user-1',
            ws_id: 'ws-1',
            archived: true,
            archived_until: '2026-03-12T00:00:00.000Z',
          },
        })
      )
    ).toBe('archive_until_changed');

    expect(
      classifyWorkspaceUserAuditEvent(
        createUpdateRow({
          record: {
            id: 'user-1',
            ws_id: 'ws-1',
            archived: true,
            archived_until: '2026-03-12T00:00:00.000Z',
            full_name: 'Another Name',
          },
          old_record: {
            id: 'user-1',
            ws_id: 'ws-1',
            archived: true,
            archived_until: '2026-03-12T00:00:00.000Z',
            full_name: 'Old Name',
          },
        })
      )
    ).toBe('updated');
  });

  it('normalizes an audit row into a detail-ready event', () => {
    const event = normalizeWorkspaceUserAuditEvent({
      row: createUpdateRow(),
      affectedUser: {
        id: 'user-1',
        name: 'Audit Target',
        email: 'audit@example.com',
      },
      actor: {
        id: 'actor-1',
        workspaceUserId: 'workspace-actor-1',
        name: 'Workspace Actor',
        email: 'actor@example.com',
      },
      source: 'backfilled',
    });

    expect(event).not.toBeNull();
    expect(event?.eventKind).toBe('archived');
    expect(event?.source).toBe('backfilled');
    expect(event?.affectedUser.name).toBe('Audit Target');
    expect(event?.actor.workspaceUserId).toBe('workspace-actor-1');
    expect(event?.changedFields).toContain('archived');
    expect(event?.fieldChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'archived',
          before: 'false',
          after: 'true',
        }),
      ])
    );
  });

  it('filters by event kind, source, and actor or affected user queries', () => {
    const archivedEvent = normalizeWorkspaceUserAuditEvent({
      row: createUpdateRow(),
      affectedUser: {
        id: 'user-1',
        name: 'Alice Example',
        email: 'alice@example.com',
      },
      actor: {
        id: 'actor-1',
        workspaceUserId: 'workspace-actor-1',
        name: 'Bob Example',
        email: 'bob@example.com',
      },
      source: 'backfilled',
    });
    const updatedEvent = normalizeWorkspaceUserAuditEvent({
      row: createUpdateRow({
        audit_record_id: 2,
        record: {
          id: 'user-2',
          ws_id: 'ws-1',
          archived: false,
          archived_until: null,
          full_name: 'Carol Updated',
        },
        old_record: {
          id: 'user-2',
          ws_id: 'ws-1',
          archived: false,
          archived_until: null,
          full_name: 'Carol Previous',
        },
      }),
      affectedUser: {
        id: 'user-2',
        name: 'Carol Example',
        email: 'carol@example.com',
      },
      actor: {
        id: 'actor-2',
        workspaceUserId: null,
        name: 'Dora Example',
        email: 'dora@example.com',
      },
      source: 'live',
    });

    const events = [archivedEvent, updatedEvent].filter(
      (event): event is WorkspaceUserAuditEvent => Boolean(event)
    );

    expect(
      filterWorkspaceUserAuditEvents(events, {
        eventKind: 'archived',
      })
    ).toHaveLength(1);
    expect(
      filterWorkspaceUserAuditEvents(events, {
        source: 'backfilled',
      })
    ).toHaveLength(1);
    expect(
      filterWorkspaceUserAuditEvents(events, {
        affectedUserQuery: 'carol',
      })
    ).toHaveLength(1);
    expect(
      filterWorkspaceUserAuditEvents(events, {
        actorQuery: 'bob',
      })
    ).toHaveLength(1);
  });

  it('summarizes counts for the currently filtered event set', () => {
    const archivedEvent = normalizeWorkspaceUserAuditEvent({
      row: createUpdateRow(),
      affectedUser: {
        id: 'user-1',
        name: 'Alice Example',
        email: 'alice@example.com',
      },
      actor: {
        id: 'actor-1',
        workspaceUserId: 'workspace-actor-1',
        name: 'Bob Example',
        email: 'bob@example.com',
      },
      source: 'backfilled',
    });
    const updatedEvent = normalizeWorkspaceUserAuditEvent({
      row: createUpdateRow({
        audit_record_id: 2,
        ts: '2026-03-11T10:00:00.000Z',
        record: {
          id: 'user-2',
          ws_id: 'ws-1',
          archived: false,
          archived_until: null,
          full_name: 'Carol Updated',
        },
        old_record: {
          id: 'user-2',
          ws_id: 'ws-1',
          archived: false,
          archived_until: null,
          full_name: 'Carol Previous',
        },
      }),
      affectedUser: {
        id: 'user-2',
        name: 'Carol Example',
        email: 'carol@example.com',
      },
      actor: {
        id: 'actor-1',
        workspaceUserId: 'workspace-actor-1',
        name: 'Bob Example',
        email: 'bob@example.com',
      },
      source: 'live',
    });

    const reactivatedEvent = normalizeWorkspaceUserAuditEvent({
      row: createUpdateRow({
        audit_record_id: 3,
        ts: '2026-03-12T10:00:00.000Z',
        record: {
          id: 'user-3',
          ws_id: 'ws-1',
          archived: false,
          archived_until: null,
          full_name: 'Dave Example',
        },
        old_record: {
          id: 'user-3',
          ws_id: 'ws-1',
          archived: true,
          archived_until: '2026-03-15T00:00:00.000Z',
          full_name: 'Dave Example',
        },
      }),
      affectedUser: {
        id: 'user-3',
        name: 'Dave Example',
        email: 'dave@example.com',
      },
      actor: {
        id: 'actor-1',
        workspaceUserId: 'workspace-actor-1',
        name: 'Bob Example',
        email: 'bob@example.com',
      },
      source: 'live',
    });
    const archiveTimingEvent = normalizeWorkspaceUserAuditEvent({
      row: createUpdateRow({
        audit_record_id: 4,
        ts: '2026-03-13T10:00:00.000Z',
        record: {
          id: 'user-4',
          ws_id: 'ws-1',
          archived: true,
          archived_until: '2026-03-25T00:00:00.000Z',
          full_name: 'Eve Example',
        },
        old_record: {
          id: 'user-4',
          ws_id: 'ws-1',
          archived: true,
          archived_until: '2026-03-20T00:00:00.000Z',
          full_name: 'Eve Example',
        },
      }),
      affectedUser: {
        id: 'user-4',
        name: 'Eve Example',
        email: 'eve@example.com',
      },
      actor: {
        id: 'actor-1',
        workspaceUserId: 'workspace-actor-1',
        name: 'Bob Example',
        email: 'bob@example.com',
      },
      source: 'live',
    });

    const { summary } = summarizeWorkspaceUserAuditEvents({
      events: [
        archivedEvent,
        updatedEvent,
        reactivatedEvent,
        archiveTimingEvent,
      ].filter((event): event is WorkspaceUserAuditEvent => Boolean(event)),
      locale: 'en',
      period: 'monthly',
      start: new Date('2026-03-01T00:00:00.000Z'),
      end: new Date('2026-04-01T00:00:00.000Z'),
    });

    expect(summary.totalEvents).toBe(4);
    expect(summary.archivedEvents).toBe(1);
    expect(summary.reactivatedEvents).toBe(1);
    expect(summary.archiveTimingEvents).toBe(1);
    expect(summary.archiveRelatedEvents).toBe(3);
    expect(summary.profileUpdates).toBe(1);
    expect(summary.affectedUsersCount).toBe(4);
    expect(summary.topActorName).toBe('Bob Example');
  });

  it('builds chart buckets with per-status counts for tooltips and stacked bars', () => {
    const events = [
      normalizeWorkspaceUserAuditEvent({
        row: createUpdateRow({
          audit_record_id: 10,
          ts: '2026-03-10T10:00:00.000Z',
        }),
      }),
      normalizeWorkspaceUserAuditEvent({
        row: createUpdateRow({
          audit_record_id: 11,
          ts: '2026-03-10T12:00:00.000Z',
          record: {
            id: 'user-11',
            ws_id: 'ws-1',
            archived: false,
            archived_until: null,
          },
          old_record: {
            id: 'user-11',
            ws_id: 'ws-1',
            archived: true,
            archived_until: '2026-03-12T00:00:00.000Z',
          },
        }),
      }),
      normalizeWorkspaceUserAuditEvent({
        row: createUpdateRow({
          audit_record_id: 12,
          ts: '2026-03-10T13:00:00.000Z',
          record: {
            id: 'user-12',
            ws_id: 'ws-1',
            archived: true,
            archived_until: '2026-03-18T00:00:00.000Z',
          },
          old_record: {
            id: 'user-12',
            ws_id: 'ws-1',
            archived: true,
            archived_until: '2026-03-15T00:00:00.000Z',
          },
        }),
      }),
      normalizeWorkspaceUserAuditEvent({
        row: createUpdateRow({
          audit_record_id: 13,
          ts: '2026-03-10T14:00:00.000Z',
          record: {
            id: 'user-13',
            ws_id: 'ws-1',
            archived: false,
            archived_until: null,
            full_name: 'Updated Name',
          },
          old_record: {
            id: 'user-13',
            ws_id: 'ws-1',
            archived: false,
            archived_until: null,
            full_name: 'Previous Name',
          },
        }),
      }),
    ].filter((event): event is WorkspaceUserAuditEvent => Boolean(event));

    const { chartStats } = summarizeWorkspaceUserAuditEvents({
      events,
      locale: 'en',
      period: 'monthly',
      start: new Date('2026-03-01T00:00:00.000Z'),
      end: new Date('2026-04-01T00:00:00.000Z'),
    });

    const bucket = chartStats.find((entry) => entry.key === '2026-03-10');

    expect(bucket).toMatchObject({
      totalCount: 4,
      archivedCount: 1,
      reactivatedCount: 1,
      archiveTimingCount: 1,
      profileUpdateCount: 1,
    });
  });
});
