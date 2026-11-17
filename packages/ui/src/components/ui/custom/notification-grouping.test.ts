import type { Notification } from '@tuturuuu/ui/hooks/use-notifications';
import { describe, expect, it } from 'vitest';
import { groupNotifications } from './notification-grouping';

const NOW = new Date(2026, 10, 16, 15, 0);

function n(id: string, created: Date, extra: Partial<Notification> = {}) {
  return {
    id,
    ws_id: 'ws',
    user_id: 'u',
    type: 'task_updated',
    title: id,
    description: null,
    data: {},
    entity_type: 'task',
    entity_id: `t-${id}`,
    read_at: '2026-11-16T00:00:00.000Z',
    created_at: created.toISOString(),
    created_by: null,
    actor: null,
    ...extra,
  } satisfies Notification;
}

describe('groupNotifications', () => {
  it('pins unresolved invites above day sections and keeps server order', () => {
    const sections = groupNotifications(
      [
        n('today', new Date(2026, 10, 16, 9)),
        n('invite', new Date(2026, 10, 10), {
          type: 'workspace_invite',
          read_at: null,
        }),
        n('yesterday', new Date(2026, 10, 15, 23, 59)),
        n('earlier', new Date(2026, 10, 14, 12)),
        n('joined', new Date(2026, 10, 9), {
          type: 'workspace_invite',
          data: { action_taken: 'accepted' },
        }),
      ],
      NOW
    );
    expect(
      sections.map((s) => [s.key, s.stacks.map((x) => x.lead.id)])
    ).toEqual([
      ['needsAction', ['invite']],
      ['today', ['today']],
      ['yesterday', ['yesterday']],
      ['earlier', ['earlier', 'joined']],
    ]);
  });

  it('collapses repeated events on one entity and keeps unread visible', () => {
    const [today] = groupNotifications(
      [
        n('newest', new Date(2026, 10, 16, 14), { entity_id: 'same' }),
        n('other', new Date(2026, 10, 16, 13)),
        n('older', new Date(2026, 10, 16, 12), {
          entity_id: 'same',
          read_at: null,
        }),
      ],
      NOW
    );
    expect(today!.stacks.map((s) => s.lead.id)).toEqual(['newest', 'other']);
    expect(today!.stacks[0]!.ids).toEqual(['newest', 'older']);
    // One unread member makes the whole stack unread, so Unread never hides it.
    expect(today!.stacks[0]!.unread).toBe(true);
  });

  it('does not merge different event types or sections', () => {
    const [today, yesterday] = groupNotifications(
      [
        n('a', new Date(2026, 10, 16, 14), { entity_id: 'same' }),
        n('b', new Date(2026, 10, 16, 13), {
          entity_id: 'same',
          type: 'task_assigned',
        }),
        n('c', new Date(2026, 10, 15, 13), { entity_id: 'same' }),
      ],
      NOW
    );
    expect(today!.stacks).toHaveLength(2);
    expect(yesterday!.stacks.map((s) => s.lead.id)).toEqual(['c']);
  });
});
