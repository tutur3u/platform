/** D79 tests for the EduFest workshop page (run via src/roadmap-data.test.ts). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import en from '../../../messages/edufest-2026.en.json' with { type: 'json' };
import vi from '../../../messages/edufest-2026.vi.json' with { type: 'json' };
import generated from '../../generated/live.json' with { type: 'json' };
import { parseLiveData } from '../../live/model.ts';
import {
  deriveDeliverable,
  indexLiveData,
  type Status,
} from '../../live/status.ts';
import { tracks } from '../tracks.ts';
import {
  AGENDA,
  AI_LEVELS,
  AI_LEVELS_DELIVERABLE,
  CAPABILITIES,
  CLASSROOM_FLOW,
  JOURNEY,
  OUTCOMES,
  TOOLS,
  toWorkshopStatus,
  USE_CASES,
  WORKSHOP_EVENT,
} from './edufest-2026.ts';

const deliverables = new Map(
  tracks.flatMap((track) =>
    track.milestones.flatMap((milestone) =>
      milestone.deliverables.map((item) => [item.id, item] as const)
    )
  )
);

/** Every use-case reference that does not resolve to a roadmap deliverable. */
function unresolved(ids: readonly string[]) {
  return ids.filter((id) => !deliverables.has(id));
}

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key)
  );
}

describe('EduFest workshop: statuses come only from the roadmap', () => {
  it('every capability, the AI demo and the journey resolve to real deliverables', () => {
    assert.deepEqual(unresolved(USE_CASES.map((item) => item.deliverable)), []);
    assert.ok(deliverables.has(AI_LEVELS_DELIVERABLE));
    const ids = new Set(USE_CASES.map((item) => item.id));
    for (const step of [...JOURNEY, ...CLASSROOM_FLOW])
      for (const id of step.uses)
        assert.ok(ids.has(id), `${step.id} uses ${id}`);
    assert.equal(ids.size, USE_CASES.length, 'use case ids are unique');
  });

  it('broken variant: a misspelled deliverable is caught', () => {
    assert.deepEqual(unresolved(['meet-classroom-quizes']), [
      'meet-classroom-quizes',
    ]);
  });

  it('collapses the five roadmap stages into three honest labels', () => {
    const map: Record<Status, string> = {
      live: 'live',
      waiting_for_prod_sync: 'in_progress',
      waiting_for_merge: 'in_progress',
      in_progress: 'in_progress',
      planned: 'planned',
    };
    for (const [status, label] of Object.entries(map))
      assert.equal(toWorkshopStatus(status as Status), label);
  });

  it('planned classroom items without PR evidence never read as live', () => {
    const index = indexLiveData(parseLiveData(generated));
    for (const item of USE_CASES) {
      const deliverable = deliverables.get(item.deliverable);
      assert.ok(deliverable);
      if (deliverable.prs.length) continue;
      const status = toWorkshopStatus(
        deriveDeliverable(deliverable, index).status
      );
      assert.notEqual(status, 'live', item.id);
    }
    // Room caps (#8141) stays in progress until its flag is on in production.
    const caps = deliverables.get('meet-classroom-caps');
    assert.deepEqual(caps?.prs, []);
    assert.equal(caps?.fallback, 'in_progress');
  });
});

describe('EduFest workshop: copy', () => {
  it('EN and VI carry exactly the same keys, and cover every id', () => {
    assert.deepEqual(keys(vi).sort(), keys(en).sort());
    for (const messages of [en, vi]) {
      for (const item of USE_CASES)
        assert.ok(
          messages.capabilities.items[
            item.id as keyof typeof messages.capabilities.items
          ],
          item.id
        );
      for (const id of CAPABILITIES)
        assert.ok(messages.capabilities.groups[id]);
      for (const id of TOOLS) assert.ok(messages.tools.names[id]);
      for (const id of AGENDA) assert.ok(messages.agenda.items[id]);
      for (const id of OUTCOMES) assert.ok(messages.outcomes.items[id]);
      for (const id of AI_LEVELS) assert.ok(messages.aiDemo.levels[id]);
      for (const step of JOURNEY)
        assert.ok(
          messages.journey.steps[step.id as keyof typeof messages.journey.steps]
        );
      for (const stage of CLASSROOM_FLOW)
        assert.ok(
          messages.flow.stages[stage.id as keyof typeof messages.flow.stages]
        );
    }
  });

  it('the hero and page title stay brand-neutral; Vietnamese says AI Agent', () => {
    for (const messages of [en, vi]) {
      const neutral = JSON.stringify([messages.hero, messages.meta]);
      assert.doesNotMatch(neutral, /Tuturuuu|Upskii/);
    }
    assert.doesNotMatch(JSON.stringify(vi), /tác tử/);
    assert.equal(vi.hero.title, 'Khi thầy cô làm học trò');
    assert.equal(vi.hero.titleAccent, 'Bước vào lớp học AI Agent thế hệ mới');
    assert.equal(en.hero.title, 'When Teachers Become Students');
    assert.equal(en.hero.titleAccent, 'Step Inside the Agentic AI Classroom');
  });

  it('no date, venue, price, form or link in the call to action', () => {
    assert.deepEqual(WORKSHOP_EVENT, { date: null, venue: null });
    assert.equal(en.hero.cta, 'Registration coming soon');
    assert.equal(vi.hero.cta, 'Sắp mở đăng ký');
    for (const messages of [en, vi])
      assert.doesNotMatch(
        JSON.stringify(messages),
        // "giá" as a whole word only: it is also inside "giáo viên".
        /[$₫]|\bVND\b|\bUSD\b|(?<!\p{L})giá(?!\p{L})/iu
      );
    const component = readFileSync(
      new URL('../../components/workshop.tsx', import.meta.url),
      'utf8'
    );
    assert.doesNotMatch(component, /<form|<input type="email"|type="text"/);
    assert.match(component, /aria-disabled="true"/);
  });
});
