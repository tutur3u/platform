import { describe, expect, it } from 'vitest';
import {
  descriptionToText,
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

  it('lets an explicit needs_user: false win over the label', () => {
    const meta = parseFleetTaskMeta({
      description: '<!-- fleet:v1 -->\nneeds_user: false\n<!-- /fleet:v1 -->',
      labels: [{ name: 'needs-user' }],
    });
    expect(meta.needsUser).toBe(false);
    expect(meta.needsUserReason).toBeNull();
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
