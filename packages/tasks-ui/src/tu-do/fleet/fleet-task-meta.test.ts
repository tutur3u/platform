import { describe, expect, it } from 'vitest';
import {
  descriptionToText,
  getFleetDisplayTitle,
  getFleetEtaState,
  getFleetStaleness,
  isFleetTitleTooLong,
  parseFleetTaskMeta,
} from './fleet-task-meta';

const BLOCK = `<!-- fleet:v1 -->
status: waiting_review
owner: rex
product: meet
priority: critical
eta: 2026-11-18T15:00:00+07:00
last_update: 2026-11-18T13:54:00+07:00
needs_user: true
needs_user_reason: Production migration needs your OK
blocked_by:
links:
- pr: https://github.com/tutur3u/platform/pull/7288
- commit: 3f9c2e1
- thread: Rex
<!-- /fleet:v1 -->

## Summary
Free classrooms cap at 10.`;

const NOW = Date.parse('2026-11-18T14:12:00+07:00');

describe('parseFleetTaskMeta', () => {
  it('reads every fleet:v1 field from a markdown description', () => {
    const meta = parseFleetTaskMeta({ description: BLOCK });
    expect(meta).toMatchObject({
      isFleetTask: true,
      hasBlock: true,
      status: 'waiting_review',
      owner: 'rex',
      product: 'meet',
      priority: 'critical',
      eta: '2026-11-18T15:00:00+07:00',
      needsUser: true,
      needsUserReason: 'Production migration needs your OK',
      blockedBy: null,
    });
    expect(meta.links).toEqual([
      {
        type: 'pr',
        value: 'https://github.com/tutur3u/platform/pull/7288',
        href: 'https://github.com/tutur3u/platform/pull/7288',
      },
      {
        type: 'commit',
        value: '3f9c2e1',
        href: null,
      },
      { type: 'thread', value: 'Rex', href: null },
    ]);
  });

  it('reads the block from a TipTap JSON document whose comment markers became text', () => {
    const paragraphs = BLOCK.split('\n').map((line) =>
      line
        ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
        : { type: 'paragraph' }
    );
    const meta = parseFleetTaskMeta({
      description: JSON.stringify({ type: 'doc', content: paragraphs }),
    });
    expect(meta.status).toBe('waiting_review');
    expect(meta.owner).toBe('rex');
    expect(meta.links).toHaveLength(3);
  });

  it('falls back to namespaced labels, native priority and end_date', () => {
    const meta = parseFleetTaskMeta({
      description: 'Plain notes only',
      labels: [
        { name: 'state:waiting-ci' },
        { name: 'owner:iris' },
        { name: 'product:mobile' },
        { name: 'needs-user' },
      ],
      priority: 'high',
      end_date: '2026-11-19T10:00:00+07:00',
    });
    expect(meta).toMatchObject({
      isFleetTask: true,
      hasBlock: false,
      status: 'waiting_ci',
      owner: 'iris',
      product: 'mobile',
      priority: 'high',
      eta: '2026-11-19T10:00:00+07:00',
      needsUser: true,
      lastUpdate: null,
    });
  });

  it('keeps missing values unknown and never fakes last_update', () => {
    const meta = parseFleetTaskMeta({
      description: '<!-- fleet:v1 -->\nstatus: \nowner:\n<!-- /fleet:v1 -->',
    });
    expect(meta).toMatchObject({
      isFleetTask: true,
      status: 'unknown',
      owner: null,
      eta: null,
      lastUpdate: null,
      needsUser: false,
    });
  });

  it('treats a task with no block and no fleet labels as an ordinary task', () => {
    expect(
      parseFleetTaskMeta({
        description: 'Buy milk',
        labels: [{ name: 'home' }],
      }).isFleetTask
    ).toBe(false);
    expect(parseFleetTaskMeta({}).isFleetTask).toBe(false);
  });

  it('reads first-class fields without any description header', () => {
    const meta = parseFleetTaskMeta(
      {
        description: 'Plain notes only',
        labels: [{ name: 'needs-user' }],
        priority: 'high',
        end_date: '2026-11-19T10:00:00+07:00',
        projects: [{ name: 'Meet' }],
        assignees: [{ display_name: 'Linh Tran' }],
        relationship_summary: { blocked_by_count: 1 },
        updated_at: '2026-11-18T13:00:00+07:00',
        needs_user_reason: 'Pick the classroom cap',
        external_key: 'N-171',
        external_links: [
          {
            kind: 'pr',
            url: 'https://github.com/tutur3u/platform/pull/7288',
            title: '#7288',
          },
          { kind: 'doc', url: 'javascript:alert(1)' },
        ],
      },
      { listStatus: 'review' }
    );
    expect(meta).toMatchObject({
      code: 'N-171',
      isFleetTask: true,
      usesLegacyHeader: false,
      status: 'waiting_review',
      owner: 'Linh Tran',
      product: 'Meet',
      priority: 'high',
      eta: '2026-11-19T10:00:00+07:00',
      lastUpdate: '2026-11-18T13:00:00+07:00',
      needsUser: true,
      needsUserReason: 'Pick the classroom cap',
      blocked: true,
      blockedByCount: 1,
      ownerKind: 'person',
    });
    expect(meta.links).toEqual([
      {
        type: 'pr',
        value: '#7288',
        href: 'https://github.com/tutur3u/platform/pull/7288',
      },
      { type: 'doc', value: 'javascript:alert(1)', href: null },
    ]);
  });

  it('lets first-class fields beat a conflicting header and uses the header only for gaps', () => {
    const meta = parseFleetTaskMeta(
      {
        description: BLOCK,
        priority: 'low',
        end_date: '2026-11-20T09:00:00+07:00',
        agent_assignees: [{ key: 'claude', display_name: 'Claude' }],
        fleet_status: 'running',
        needs_user: false,
      },
      { listStatus: 'active' }
    );
    expect(meta).toMatchObject({
      status: 'running',
      owner: 'Claude',
      ownerKind: 'agent',
      priority: 'low',
      eta: '2026-11-20T09:00:00+07:00',
      needsUser: false,
      needsUserReason: null,
      product: 'meet',
      lastUpdate: '2026-11-18T13:54:00+07:00',
      usesLegacyHeader: true,
    });
  });

  it('prefers the list status over the header status, and state: labels over both', () => {
    expect(
      parseFleetTaskMeta({ description: BLOCK }, { listStatus: 'not_started' })
        .status
    ).toBe('queued');
    expect(
      parseFleetTaskMeta(
        { description: BLOCK, labels: [{ name: 'state:waiting-ci' }] },
        { listStatus: 'active' }
      ).status
    ).toBe('waiting_ci');
  });

  it('raises needs-you from a header status of needs_user when the list status wins', () => {
    const meta = parseFleetTaskMeta(
      { description: '<!-- fleet:v1 -->\nstatus: needs_user' },
      { listStatus: 'active' }
    );
    expect(meta.status).toBe('running');
    expect(meta.needsUser).toBe(true);
    expect(meta.usesLegacyHeader).toBe(true);
  });
});

describe('fleet link safety', () => {
  it('links only http(s) URLs written in the data and keeps other schemes as text', () => {
    const meta = parseFleetTaskMeta({
      description: [
        '<!-- fleet:v1 -->',
        'links: https://example.com/runs/1',
        '- doc: javascript:alert(1)',
        '- run: data:text/html,hi',
        '- pr: #7288',
        '- issue: http://example.com/a b',
        '<!-- /fleet:v1 -->',
      ].join('\n'),
    });
    expect(meta.links.map((l) => [l.type, l.href])).toEqual([
      ['link', 'https://example.com/runs/1'],
      ['doc', null],
      ['run', null],
      ['pr', null],
      ['issue', null],
    ]);
  });
});

describe('fleet time helpers', () => {
  it('maps last_update age onto fresh, aging, stale and unknown', () => {
    expect(getFleetStaleness('2026-11-18T13:54:00+07:00', NOW)).toBe('fresh');
    expect(getFleetStaleness('2026-11-18T09:00:00+07:00', NOW)).toBe('aging');
    expect(getFleetStaleness('2026-11-16T14:00:00+07:00', NOW)).toBe('stale');
    expect(getFleetStaleness(null, NOW)).toBe('unknown');
    expect(getFleetStaleness('not a date', NOW)).toBe('unknown');
  });

  it('marks ETAs overdue, due soon or on track, and never overdue once done', () => {
    expect(getFleetEtaState('2026-11-18T15:00:00+07:00', 'running', NOW)).toBe(
      'due_soon'
    );
    expect(getFleetEtaState('2026-11-18T22:00:00+07:00', 'running', NOW)).toBe(
      'on_track'
    );
    expect(getFleetEtaState('2026-11-17T18:00:00+07:00', 'blocked', NOW)).toBe(
      'overdue'
    );
    expect(getFleetEtaState('2026-11-17T18:00:00+07:00', 'done', NOW)).toBe(
      'on_track'
    );
    expect(getFleetEtaState(null, 'running', NOW)).toBe('none');
  });

  it('flags titles over 72 characters', () => {
    expect(
      isFleetTitleTooLong('Approve the Meet classroom limits migration')
    ).toBe(false);
    expect(isFleetTitleTooLong('x'.repeat(73))).toBe(true);
  });

  it('returns markdown unchanged and survives malformed JSON', () => {
    expect(descriptionToText('a\nb')).toBe('a\nb');
    expect(descriptionToText('{not json')).toBe('{not json');
  });
});

describe('fleet owner kind', () => {
  it('marks agents, contacts, people and label owners', () => {
    expect(
      parseFleetTaskMeta({
        virtual_assignees: [{ key: 'cora', kind: 'agent' }],
      }).ownerKind
    ).toBe('agent');
    expect(
      parseFleetTaskMeta({
        virtual_assignees: [{ display_name: 'Selene', kind: 'contact' }],
      }).ownerKind
    ).toBe('person');
    expect(
      parseFleetTaskMeta({
        labels: [{ name: 'owner:rex' }],
        agent_assignees: [{ key: 'claude' }],
      })
    ).toMatchObject({ owner: 'rex', ownerKind: null });
    expect(parseFleetTaskMeta({ description: BLOCK }).ownerKind).toBeNull();
  });
});

describe('getFleetDisplayTitle', () => {
  it('drops a leading copy of the card code', () => {
    expect(getFleetDisplayTitle('N-165: Fleet board UX', 'N-165')).toBe(
      'Fleet board UX'
    );
    expect(getFleetDisplayTitle('[n-165] Fleet board UX', 'N-165')).toBe(
      'Fleet board UX'
    );
    expect(getFleetDisplayTitle('N-165 \u2014 Fleet board UX', 'N-165')).toBe(
      'Fleet board UX'
    );
    for (const name of [
      '[N-165]: Fleet board UX',
      '[N-165] - Fleet board UX',
      'N-165 -- Fleet board UX',
    ]) {
      expect(getFleetDisplayTitle(name, 'N-165')).toBe('Fleet board UX');
    }
  });

  it('keeps other codes, titles without a code, and titles that would empty', () => {
    expect(getFleetDisplayTitle('N-163: Board CLI', 'N-165')).toBe(
      'N-163: Board CLI'
    );
    expect(getFleetDisplayTitle('N-165: Board CLI', null)).toBe(
      'N-165: Board CLI'
    );
    expect(getFleetDisplayTitle('N-1650 board', 'N-165')).toBe('N-1650 board');
    expect(getFleetDisplayTitle('N-165-2: Follow-up', 'N-165')).toBe(
      'N-165-2: Follow-up'
    );
    expect(getFleetDisplayTitle('[N-165]', 'N-165')).toBe('[N-165]');
    expect(getFleetDisplayTitle('  Plain title ', 'N-165')).toBe('Plain title');
  });
});
