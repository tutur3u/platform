import { describe, expect, it } from 'vitest';
import { type FleetTaskMeta, parseFleetTaskMeta } from './fleet-task-meta';
import {
  FLEET_BACKLOG_LIMIT,
  type FleetItem,
  getFleetBacklog,
  getFleetBucket,
  groupFleetItems,
  summarizeFleet,
} from './fleet-triage';

const NOW = Date.parse('2026-11-18T14:00:00+07:00');

function item(
  id: string,
  meta: Partial<FleetTaskMeta>,
  listStatus: string | null = 'active'
): FleetItem<{ id: string }> {
  return {
    task: { id },
    listStatus,
    meta: { ...parseFleetTaskMeta({}), isFleetTask: true, ...meta },
  };
}

const items = [
  item(
    'needs',
    {
      status: 'waiting_review',
      needsUser: true,
      product: 'meet',
      priority: 'critical',
      owner: 'rex',
    },
    'review'
  ),
  item('run', {
    status: 'running',
    product: 'tasks',
    priority: 'high',
    owner: 'claude',
    lastUpdate: '2026-11-18T13:50:00+07:00',
  }),
  item('ci', {
    status: 'waiting_ci',
    product: 'meet',
    priority: 'normal',
    owner: 'iris',
  }),
  item('blocked', {
    status: 'blocked',
    blocked: true,
    product: 'upskii',
    owner: 'cora',
    lastUpdate: '2026-11-16T09:00:00+07:00',
  }),
  item('blocked-by', {
    status: 'running',
    blocked: true,
    blockedBy: 'Stripe export',
    product: 'upskii',
  }),
  item('queued', { status: 'queued', product: 'mail' }, 'not_started'),
  item('done', { status: 'done', product: 'tasks' }, 'done'),
  item('archived', { status: 'running', product: 'tasks' }, 'closed'),
];

describe('getFleetBucket', () => {
  it('puts needs-you first, then blocked, then live, and keeps queued and finished work out', () => {
    expect(items.map((i) => getFleetBucket(i))).toEqual([
      'needs_me',
      'live',
      'live',
      'blocked',
      'blocked',
      null,
      null,
      null,
    ]);
  });

  it('counts an untagged card in an active list as live', () => {
    expect(getFleetBucket(item('x', { status: 'unknown' }, 'active'))).toBe(
      'live'
    );
    expect(
      getFleetBucket(item('y', { status: 'unknown' }, 'not_started'))
    ).toBeNull();
  });
});

describe('summarizeFleet', () => {
  it('counts the triage buckets, stale open cards, queued and done (not archived)', () => {
    expect(summarizeFleet(items, NOW)).toEqual({
      needsMe: 1,
      live: 2,
      blocked: 2,
      stale: 1,
      queued: 1,
      done: 1,
      open: 6,
    });
  });
});

describe('groupFleetItems', () => {
  it('always returns the three triage buckets in order', () => {
    const groups = groupFleetItems(items, 'triage');
    expect(groups.map((g) => [g.key, g.items.map((i) => i.task.id)])).toEqual([
      ['needs_me', ['needs']],
      ['live', ['run', 'ci']],
      ['blocked', ['blocked', 'blocked-by']],
    ]);
  });

  it('ranks product groups by attention: needs-you, then blocked, then size', () => {
    expect(groupFleetItems(items, 'product').map((g) => g.key)).toEqual([
      'meet',
      'upskii',
      'tasks',
    ]);
  });

  it('orders priority groups P0 to P3 after attention, with untriaged last', () => {
    expect(groupFleetItems(items, 'priority').map((g) => g.key)).toEqual([
      'critical',
      '',
      'high',
      'normal',
    ]);
  });

  it('sorts cards within a group by needs-you, priority, then oldest update', () => {
    const groups = groupFleetItems(
      [
        item('a', { status: 'running', owner: 'x', priority: 'low' }),
        item('b', {
          status: 'running',
          owner: 'x',
          priority: 'high',
          lastUpdate: '2026-11-18T10:00:00+07:00',
        }),
        item('c', {
          status: 'running',
          owner: 'x',
          priority: 'high',
          lastUpdate: '2026-11-18T08:00:00+07:00',
        }),
      ],
      'owner'
    );
    expect(groups[0]!.items.map((i) => i.task.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('getFleetBacklog', () => {
  it('lists queued work and recent done work, newest first, without archived or documents cards', () => {
    const backlog = getFleetBacklog([
      item('q-low', { status: 'queued', priority: 'low' }, 'not_started'),
      item('q-high', { status: 'queued', priority: 'high' }, 'not_started'),
      item('live', { status: 'running' }),
      item('doc', { status: 'unknown' }, 'documents'),
      item(
        'd-old',
        { status: 'done', lastUpdate: '2026-11-17T10:00:00+07:00' },
        'done'
      ),
      item(
        'd-new',
        { status: 'done', lastUpdate: '2026-11-18T10:00:00+07:00' },
        'done'
      ),
      item('d-none', { status: 'done' }, 'done'),
      item('archived', { status: 'done' }, 'closed'),
    ]);
    expect(backlog.queued.map((i) => i.task.id)).toEqual(['q-high', 'q-low']);
    expect(backlog.done.map((i) => i.task.id)).toEqual([
      'd-new',
      'd-old',
      'd-none',
    ]);
    expect(backlog.queuedOverflow).toBe(0);
    expect(backlog.doneOverflow).toBe(0);
  });

  it('caps both lists and counts the rest', () => {
    const many = (prefix: string, status: 'done' | 'queued', list: string) =>
      Array.from({ length: FLEET_BACKLOG_LIMIT + 3 }, (_, n) =>
        item(`${prefix}${n}`, { status }, list)
      );
    const backlog = getFleetBacklog([
      ...many('d', 'done', 'done'),
      ...many('q', 'queued', 'not_started'),
    ]);
    expect(backlog.done).toHaveLength(FLEET_BACKLOG_LIMIT);
    expect(backlog.doneOverflow).toBe(3);
    expect(backlog.queued).toHaveLength(FLEET_BACKLOG_LIMIT);
    expect(backlog.queuedOverflow).toBe(3);
  });

  it('keeps unbucketed documents cards out of the summary', () => {
    const summary = summarizeFleet([
      item('doc', { status: 'unknown' }, 'documents'),
    ]);
    expect(summary).toMatchObject({ open: 0, queued: 0 });
  });
});
