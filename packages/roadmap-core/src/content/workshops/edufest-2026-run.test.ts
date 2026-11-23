/** Tests for the EduFest run of show (run via src/roadmap-data.test.ts). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import en from '../../../messages/edufest-2026.en.json' with { type: 'json' };
import vi from '../../../messages/edufest-2026.vi.json' with { type: 'json' };
import {
  type BugFeed,
  feedFromSearch,
  fetchEdufestBugs,
  groupBugs,
  nextBugFeed,
  parseBugFeed,
  toBug,
} from '../../live/edufest-bugs.ts';
import { isRateLimited } from '../../live/use-live-data.ts';
import { tracks } from '../tracks.ts';
import type { WorkshopStatus } from './edufest-2026.ts';
import { VERDICTS } from './edufest-2026-readiness.ts';
import {
  LEADS,
  minutesLabel,
  READINESS,
  RUN_OF_SHOW,
  RUN_STEPS,
  SESSION_MINUTES,
  shortDate,
  stepReadiness,
  TEAMS,
  type Verdict,
  worstOf,
} from './edufest-2026-run.ts';

const deliverables = new Map(
  tracks.flatMap((track) =>
    track.milestones.flatMap((m) => m.deliverables.map((d) => [d.id, d]))
  )
);

describe('EduFest run of show: structure', () => {
  it('runs S0 to S7 back to back, from doors to the 90-minute close', () => {
    assert.deepEqual(
      RUN_OF_SHOW.map((step) => step.id),
      [...RUN_STEPS]
    );
    assert.equal(RUN_OF_SHOW[0]?.end, 0, 'doors close at T0');
    assert.equal(RUN_OF_SHOW.at(-1)?.end, SESSION_MINUTES);
    for (let i = 1; i < RUN_OF_SHOW.length; i += 1)
      assert.equal(RUN_OF_SHOW[i]?.start, RUN_OF_SHOW[i - 1]?.end);
  });

  it('hands over Upskii to Meet at S4 and Meet to Tasks at S7 only', () => {
    const handovers = RUN_OF_SHOW.filter((step) => step.handover).map(
      (step) => [step.id, step.handover?.from, step.handover?.to]
    );
    assert.deepEqual(handovers, [
      ['s4', 'upskii', 'meet'],
      ['s7', 'meet', 'tasks'],
    ]);
  });

  it('seats the room as students before flipping to the teacher seat', () => {
    const seat = (id: string) =>
      RUN_OF_SHOW.find((step) => step.id === id)?.seat;
    assert.equal(seat('s2'), 'student');
    assert.equal(seat('s3'), 'teacher');
    const firstTeacher = RUN_OF_SHOW.findIndex((s) => s.seat === 'teacher');
    const firstStudent = RUN_OF_SHOW.findIndex((s) => s.seat === 'student');
    assert.ok(firstStudent < firstTeacher);
  });

  it('names a lead for every step, and two on each handover', () => {
    for (const step of RUN_OF_SHOW) {
      assert.ok(step.leads.length > 0, step.id);
      for (const lead of step.leads) assert.ok(LEADS.includes(lead), step.id);
    }
    const s4 = RUN_OF_SHOW.find((step) => step.id === 's4');
    assert.deepEqual(s4?.leads, ['cuong', 'phuc']);
  });

  it('takes questions while the meeting is live, before it ends', () => {
    const qa = RUN_OF_SHOW.find((step) => step.id === 's6');
    const after = RUN_OF_SHOW.find((step) => step.id === 's7');
    assert.deepEqual(qa?.deliverables, ['meet-live-qa']);
    assert.ok(after?.deliverables.includes('meet-action-items-roundtrip'));
    assert.equal(after?.end, SESSION_MINUTES);
  });

  it('every step depends on real roadmap deliverables', () => {
    for (const step of RUN_OF_SHOW)
      for (const id of step.deliverables)
        assert.ok(deliverables.has(id), `${step.id}: ${id}`);
    for (const id of [
      'upskii-account-linking',
      'upskii-integration-card',
      'settings-integrations-section',
      'meet-upskii-presenter',
      'meet-follow-me',
      'mira-owner-consent',
      'meet-action-items-roundtrip',
      'meet-guest-join',
    ]) {
      const item = deliverables.get(id);
      assert.ok(item, id);
      // No evidence yet: these can never read as live.
      assert.deepEqual(item.prs, [], id);
      assert.ok(['planned', 'in_progress'].includes(item.fallback), id);
      assert.ok(item.titleVi, id);
    }
  });

  it('every step has EN and VI copy; verdicts name teams, never people', () => {
    for (const messages of [en, vi])
      for (const id of RUN_STEPS) {
        assert.ok(messages.agenda.items[id].title, id);
        assert.ok(messages.agenda.items[id].body, id);
      }
    for (const messages of [en, vi])
      for (const lead of LEADS) assert.ok(messages.agenda.leads[lead], lead);
    for (const [id, verdict] of Object.entries(VERDICTS)) {
      assert.ok(READINESS.includes(verdict.readiness), id);
      assert.ok(TEAMS.includes(verdict.owner), id);
      assert.match(verdict.checkedAt, /^\d{4}-\d{2}-\d{2}$/, id);
      if (verdict.nextEta) assert.match(verdict.nextEta, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(verdict.left.en.trim() && verdict.left.vi.trim(), id);
      assert.doesNotMatch(
        JSON.stringify(verdict),
        /\b(Atlas|Iris|Rex|Selene|Claude|Codex|lane|E\d)\b/i,
        id
      );
    }
  });

  it('labels minutes from the start, and doors as before it', () => {
    assert.deepEqual(minutesLabel({ start: -20, end: 0 }), {
      kind: 'before',
      minutes: 20,
    });
    assert.deepEqual(minutesLabel({ start: 8, end: 22 }), {
      kind: 'range',
      start: 8,
      end: 22,
    });
    assert.equal(shortDate('2026-11-24', 'en'), '24 Nov');
    assert.equal(shortDate('2026-11-24', 'vi'), '24/11');
    // 20:00 UTC is already the next day in Vietnam.
    assert.equal(shortDate('2026-11-23T20:00:00.000Z', 'en'), '24 Nov');
  });
});

describe('EduFest run of show: derived status is the worst of its deliverables', () => {
  const statuses = new Map<string, WorkshopStatus>([
    ['a', 'live'],
    ['b', 'in_progress'],
    ['c', 'planned'],
  ]);

  it('takes the least ready deliverable; unknown counts as planned', () => {
    assert.equal(worstOf(['a'], statuses), 'live');
    assert.equal(worstOf(['a', 'b'], statuses), 'in_progress');
    assert.equal(worstOf(['a', 'b', 'c'], statuses), 'planned');
    assert.equal(worstOf(['a', 'missing-id'], statuses), 'planned');
    assert.equal(worstOf([], statuses), null);
    // Broken variant: a best-of would call a half-built step live.
    const bestOf = (ids: string[]) =>
      ids.map((id) => statuses.get(id)).includes('live') ? 'live' : 'planned';
    assert.notEqual(bestOf(['a', 'c']), worstOf(['a', 'c'], statuses));
  });
});

describe('EduFest run of show: the readiness union', () => {
  const verdict = (readiness: Verdict['readiness'], checkedAt: string) =>
    ({
      readiness,
      checkedAt,
      owner: 'meet',
      nextEta: '2026-11-25',
      left: { en: 'x', vi: 'x' },
    }) satisfies Verdict;
  const planned = new Map<string, WorkshopStatus>();
  const step = { deliverables: ['meet-follow-me'] };
  const at = (day: string) => Date.parse(`${day}T12:00:00+07:00`);

  it('a recent check shows its verdict beside the derived status', () => {
    const shown = stepReadiness(
      step,
      verdict('at_risk', '2026-11-23'),
      planned,
      at('2026-11-24')
    );
    assert.equal(shown.kind, 'checked');
    assert.equal(shown.derived, 'planned');
    if (shown.kind === 'checked') assert.equal(shown.overdue, false);
  });

  it('a check older than three days is stale and never reads as ready', () => {
    const shown = stepReadiness(
      step,
      verdict('ready', '2026-11-20'),
      planned,
      at('2026-11-24')
    );
    assert.equal(shown.kind, 'stale');
    assert.equal(shown.derived, 'planned');
    if (shown.kind === 'stale') assert.equal(shown.ageDays, 4);
    // Three days old is still a current check.
    assert.equal(
      stepReadiness(
        step,
        verdict('ready', '2026-11-21'),
        planned,
        at('2026-11-24')
      ).kind,
      'checked'
    );
  });

  it('an open verdict past its next date is overdue; ready never is', () => {
    const late = stepReadiness(
      step,
      verdict('blocked', '2026-11-24'),
      planned,
      at('2026-11-26')
    );
    assert.ok(late.kind === 'checked' && late.overdue);
    const done = stepReadiness(
      step,
      verdict('ready', '2026-11-24'),
      planned,
      at('2026-11-26')
    );
    assert.ok(done.kind === 'checked' && !done.overdue);
  });

  it('a step with no check says so; one without products has no derived status', () => {
    assert.deepEqual(
      stepReadiness(step, undefined, planned, at('2026-11-24')),
      {
        kind: 'unchecked',
        derived: 'planned',
      }
    );
    assert.equal(
      stepReadiness({ deliverables: [] }, undefined, planned, 0).derived,
      null
    );
  });
});

const issue = (
  number: number,
  labels: string[],
  extra: Record<string, unknown> = {}
) => ({
  number,
  title: `Bug ${number}`,
  state: 'open',
  body: 'secret repro steps',
  labels: labels.map((name) => ({ name })),
  ...extra,
});
const OBSERVED = '2026-11-24T03:00:00.000Z';

describe('EduFest run of show: open bugs per step', () => {
  it('keeps titles only, and drops untagged, closed, PR and security items', () => {
    assert.deepEqual(toBug(issue(5, ['edufest-2026', 'edufest:s4'])), {
      number: 5,
      title: 'Bug 5',
      steps: ['s4'],
    });
    assert.equal(toBug(issue(6, ['edufest:s4'])), null);
    assert.equal(toBug(issue(7, ['edufest-2026'], { state: 'closed' })), null);
    assert.equal(
      toBug(issue(8, ['edufest-2026', 'edufest:s4', 'security'])),
      null
    );
  });

  it('groups by step label, newest first, three titles shown with the full count', () => {
    const feed = feedFromSearch(
      {
        items: [
          issue(10, ['edufest-2026', 'edufest:s5']),
          issue(14, ['edufest-2026', 'edufest:s5', 'edufest:s4']),
          issue(12, ['edufest-2026', 'edufest:s5']),
          issue(11, ['edufest-2026', 'edufest:s5']),
          issue(9, ['edufest-2026']),
        ],
        total: 5,
      },
      OBSERVED,
      'live'
    );
    const groups = groupBugs(feed);
    const s5 = groups.s5;
    assert.ok(s5.state === 'observed');
    assert.equal(s5.count, 4);
    assert.deepEqual(
      s5.shown.map((bug) => bug.number),
      [14, 12, 11]
    );
    assert.ok(groups.s4.state === 'observed' && groups.s4.count === 1);
    assert.ok(groups.s0.state === 'observed' && groups.s0.count === 0);
    assert.doesNotMatch(JSON.stringify(feed), /secret repro/);
  });

  it('a capped search is unavailable, never a partial count', () => {
    const feed = feedFromSearch(
      { items: [issue(1, ['edufest-2026', 'edufest:s1'])], total: 120 },
      OBSERVED,
      'build'
    );
    assert.deepEqual(feed, { state: 'unavailable', reason: 'incomplete' });
    for (const step of RUN_STEPS)
      assert.deepEqual(groupBugs(feed)[step], { state: 'unavailable' });
  });

  it('reads issues with one search, never pull requests', async () => {
    const urls: string[] = [];
    const feed = await fetchEdufestBugs(
      async (url) => {
        urls.push(url);
        return Response.json({
          total_count: 2,
          items: [
            issue(3, ['edufest-2026', 'edufest:s2']),
            issue(4, ['edufest-2026', 'edufest:s2'], {
              pull_request: { merged_at: null },
            }),
          ],
        });
      },
      Date.parse(OBSERVED),
      { source: 'live' }
    );
    assert.equal(urls.length, 1);
    const query = new URL(urls[0] as string).searchParams.get('q') ?? '';
    assert.match(query, /is:issue/);
    assert.match(query, /is:open/);
    assert.match(query, /label:edufest-2026/);
    assert.doesNotMatch(query, /is:pr/);
    assert.ok(feed.state === 'observed');
    assert.deepEqual(
      feed.issues.map((bug) => bug.number),
      [3]
    );
  });

  it('a rate limit degrades to unavailable, and keeps an earlier observation', async () => {
    const error = await fetchEdufestBugs(
      async () => new Response('', { status: 403 }),
      0,
      { source: 'live' }
    ).catch((reason: unknown) => reason);
    assert.ok(isRateLimited(error));
    const limited: BugFeed = { state: 'unavailable', reason: 'rate_limited' };
    assert.deepEqual(nextBugFeed(limited, limited), limited);
    const earlier: BugFeed = {
      state: 'observed',
      observedAt: OBSERVED,
      source: 'build',
      issues: [],
    };
    assert.equal(nextBugFeed(earlier, limited), earlier);
    // Broken variant: blanking to an empty list would read as zero bugs.
    assert.ok(groupBugs(limited).s3.state === 'unavailable');
  });

  it('the embedded build feed is validated; anything off reads as unavailable', () => {
    assert.deepEqual(parseBugFeed(null), {
      state: 'unavailable',
      reason: 'not_observed',
    });
    assert.equal(
      parseBugFeed({ state: 'observed', source: 'build', issues: 'x' }).state,
      'unavailable'
    );
    const parsed = parseBugFeed({
      state: 'observed',
      observedAt: OBSERVED,
      source: 'build',
      issues: [{ number: 2, title: 'T', steps: ['s1'], body: 'secret' }],
    });
    assert.ok(parsed.state === 'observed');
    assert.deepEqual(parsed.issues, [{ number: 2, title: 'T', steps: ['s1'] }]);
    assert.equal(
      parseBugFeed({
        state: 'observed',
        observedAt: OBSERVED,
        source: 'build',
        issues: [{ number: 2, title: 'T', steps: ['s9'] }],
      }).state,
      'unavailable'
    );
  });
});
