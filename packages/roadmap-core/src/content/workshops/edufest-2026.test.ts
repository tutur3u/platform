import { readStyles } from '../../style-source.ts';
/** D79 tests for the EduFest workshop page (run via src/roadmap-data.test.ts). */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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
  DEMOS,
  demoBadge,
  FAQ,
  JOURNEY,
  LEARN,
  PRACTICAL,
  TOOLS,
  toWorkshopStatus,
  USE_CASES,
  WORKSHOP_EVENT,
} from './edufest-2026.ts';

/** Every EduFest workshop component module (components/workshop/*), joined. */
function workshopSource(file?: string) {
  const dir = new URL('../../components/workshop/', import.meta.url);
  const files = file
    ? [file]
    : readdirSync(dir)
        .filter((name) => /\.tsx?$/.test(name))
        .sort();
  return files
    .map((name) => readFileSync(new URL(name, dir), 'utf8'))
    .join('\n');
}

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
    for (const step of JOURNEY)
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
      for (const id of AI_LEVELS) assert.ok(messages.aiDemo.levels[id]);
      for (const step of JOURNEY)
        assert.ok(
          messages.journey.steps[step.id as keyof typeof messages.journey.steps]
        );
    }
  });

  it('the hero and page title stay brand-neutral; Vietnamese says AI Agent', () => {
    for (const messages of [en, vi]) {
      const neutral = JSON.stringify([messages.hero, messages.meta]);
      assert.doesNotMatch(neutral, /Tuturuuu|Upskii/);
    }
    assert.doesNotMatch(JSON.stringify(vi), /tác tử/);
    assert.equal(vi.hero.title, 'Một lớp học, nhiều AI Agent');
    assert.equal(
      vi.hero.titleAccent,
      'Vận hành lớp học AI trực tuyến, từ bài giảng đến bài kiểm tra'
    );
    assert.equal(en.hero.title, 'One Class, Many Agents');
    assert.equal(
      en.hero.titleAccent,
      'Running a Live AI Classroom, From Lesson to Quiz'
    );
  });

  it('the date and venue are the confirmed ones; no price, form or link in the call to action', () => {
    // The USER confirmed Saturday 5 December 2026 at RMIT SGS.
    assert.equal(WORKSHOP_EVENT.isoDate, '2026-12-05');
    assert.equal(new Date('2026-12-05T12:00:00Z').getUTCDay(), 6, 'a Saturday');
    assert.equal(en.hero.dateValue, 'Saturday, 5 December 2026');
    assert.equal(vi.hero.dateValue, 'Thứ Bảy, 05/12/2026');
    assert.match(
      en.hero.venueValue,
      /RMIT University Vietnam.*702 Nguyen Van Linh.*Building 2/
    );
    assert.match(
      vi.hero.venueValue,
      /RMIT Việt Nam.*702 Nguyễn Văn Linh.*Tòa nhà 2/
    );
    assert.equal(en.hero.cta, 'Registration coming soon');
    assert.equal(vi.hero.cta, 'Sắp mở đăng ký');
    for (const messages of [en, vi])
      assert.doesNotMatch(
        JSON.stringify(messages),
        // "giá" as a whole word only: it is also inside "giáo viên".
        /[$₫]|\bVND\b|\bUSD\b|(?<!\p{L})giá(?!\p{L})/iu
      );
    const component = workshopSource();
    assert.doesNotMatch(component, /<form|<input type="email"|type="text"/);
    assert.match(component, /aria-disabled="true"/);
  });
});

describe('EduFest workshop: calendar and map', () => {
  it('builds an all-day iCalendar event with escaped text', async () => {
    const { buildIcs, mapHref } = await import('./edufest-2026.ts');
    const ics = buildIcs({
      isoDate: '2026-12-05',
      title: 'A, b; c',
      location: 'RMIT, Building 2',
      url: 'https://tuturuuu.com/roadmap/workshops/edufest-2026',
    });
    assert.match(ics, /DTSTART;VALUE=DATE:20261205\r\n/);
    assert.match(ics, /DTEND;VALUE=DATE:20261206\r\n/);
    assert.match(ics, /SUMMARY:A\\, b\\; c\r\n/);
    assert.match(ics, /LOCATION:RMIT\\, Building 2\r\n/);
    assert.ok(
      ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n')
    );
    // Broken variant: a month-end date rolls into the next month.
    assert.match(
      buildIcs({ isoDate: '2026-12-31', title: 't', location: 'l', url: 'u' }),
      /DTEND;VALUE=DATE:20270101/
    );
    assert.equal(mapHref(null), null);
    assert.match(
      mapHref('702 Nguyen Van Linh') ?? '',
      /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=702%20Nguyen/
    );
  });
});

describe('EduFest workshop: learn, demos and practical information', () => {
  it('every learn card, demo, practical row and FAQ id has copy in both languages', () => {
    for (const messages of [en, vi]) {
      for (const id of LEARN)
        assert.ok(
          messages.learn.items[id].title && messages.learn.items[id].body
        );
      for (const demo of DEMOS) {
        const copy = messages.demos.items[demo.id];
        assert.ok(copy.title && copy.body && copy.try, demo.id);
      }
      for (const id of PRACTICAL) assert.ok(messages.practical.labels[id], id);
      for (const id of FAQ)
        assert.ok(messages.faq.items[id].q && messages.faq.items[id].a);
    }
  });

  it('a demo status comes from a real deliverable, or says Coming', () => {
    for (const demo of DEMOS) {
      if (demo.deliverable)
        assert.ok(deliverables.has(demo.deliverable), demo.id);
      assert.ok(!(demo.deliverable && demo.coming), demo.id);
    }
    // Not public yet: the booth game has no link and reads as Coming.
    const booth = DEMOS.find((demo) => demo.id === 'booth');
    assert.equal(booth?.coming, true);
    assert.equal(booth?.href, null);
    assert.equal(en.demos.coming, 'Coming');
    // Broken variant: a misspelled demo deliverable is caught.
    assert.deepEqual(unresolved(['meet-clasroom-caps']), [
      'meet-clasroom-caps',
    ]);
  });

  it('each demo card shows its derived status, Coming, or nothing', () => {
    const byId = new Map(DEMOS.map((demo) => [demo.id, demo]));
    const statuses = new Map([['meet-classroom-caps', 'in_progress' as const]]);
    assert.equal(demoBadge(byId.get('classroom')!, statuses), 'in_progress');
    // An unknown deliverable status never reads as live.
    assert.equal(demoBadge(byId.get('mira')!, statuses), 'planned');
    assert.equal(demoBadge(byId.get('booth')!, statuses), 'coming');
    assert.equal(demoBadge(byId.get('fleet')!, statuses), null);
    for (const demo of DEMOS)
      if (demo.href)
        assert.match(demo.href, /^https:\/\/[a-z0-9.-]+\//, demo.id);
    const component = workshopSource('showcase.tsx');
    assert.match(component, /demoBadge\(demo, statuses\)/);
  });

  it('demo and map links reserve at least 24px height', () => {
    const css = readStyles();
    for (const selector of ['.ws-demo-link', '.ws-practical-link'])
      assert.match(cssRule(css, selector) ?? '', /min-height: 24px;/, selector);
  });

  it('copy never promises AI help levels or 100-person rooms as available today', () => {
    assert.match(en.faq.items.answers.a, /are planned/);
    assert.match(
      en.demos.items.classroom.body,
      /a target; hosted video capacity is not yet verified/
    );
    assert.match(en.journey.steps.stuck.body, /teacher controls are planned/);
    assert.match(en.demos.items.booth.body, /^A preview/);
    assert.ok(!('subtitle' in en.aiDemo), 'unused default-off claim');
    assert.match(en.demos.items.mira.body, /18\+/);
    // Broken variant: the old wording promised a teacher choice that is planned.
    assert.doesNotMatch(
      en.faq.items.answers.a,
      /^Only if the teacher allows it/
    );
  });

  it('FAQ answers stay honest and copy invents no testimonials', () => {
    assert.match(en.faq.items.ready.a, /Planned means not built yet/);
    assert.match(en.faq.items.registration.a, /not open yet/);
    assert.match(en.faq.items.data.a, /off by default/);
    // Broken variant: an attributed quote would read as a fake testimonial.
    for (const messages of [en, vi])
      assert.doesNotMatch(
        JSON.stringify([messages.demos, messages.learn]),
        /[—-]\s*[A-Z][a-z]+ [A-Z]\.|“[^”]+”\s*[—-]/
      );
  });
});

/** The declarations of one CSS rule, by its exact selector. */
function cssRule(css: string, selector: string): string | null {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) return null;
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('\n}', open));
}

describe('EduFest workshop: hero', () => {
  const css = readStyles();
  const component = workshopSource();

  it('the wash spans the whole hero instead of a fixed band that stops mid-section', () => {
    const wash = cssRule(css, '.ws-hero-wash');
    assert.ok(wash, '.ws-hero-wash exists');
    const covers = (rule: string) =>
      /\n\s*top:/.test(rule) &&
      /\n\s*bottom:/.test(rule) &&
      !/\n\s*height:/.test(rule);
    assert.ok(covers(wash), wash);
    // Broken variant: the old fixed 560px band is caught.
    assert.equal(covers('\n  top: -140px;\n  height: 560px;'), false);
  });

  it('drops the floating avatar art and the gradient-text title', () => {
    assert.ok(!component.includes('WsHeroArt'));
    assert.ok(!css.includes('.ws-hero-art'));
    assert.equal(cssRule(css, '.ws-hero h1 .accent'), null);
    const title = cssRule(css, '.ws-h1-main') ?? '';
    assert.ok(!/background-clip:\s*text/.test(title), title);
  });

  it('underlines a phrase that really is in the title, in EN and VI', () => {
    for (const messages of [en, vi])
      assert.ok(
        messages.hero.title.includes(messages.hero.titleMark),
        messages.hero.titleMark
      );
  });
});

describe('EduFest workshop: AI help levels', () => {
  it('the level control shows only on steps whose screen changes with it', async () => {
    const { AI_LEVEL_STEPS, isAiLevelStep } = await import('./edufest-2026.ts');
    const steps = new Set(JOURNEY.map((step) => step.id));
    for (const id of AI_LEVEL_STEPS) assert.ok(steps.has(id), id);
    assert.equal(isAiLevelStep('stuck'), true);
    // Broken variant: a step without level-dependent content gets no control.
    assert.equal(isAiLevelStep('arrive'), false);
    const component = workshopSource('simulator.tsx');
    const gate = component.indexOf('isAiLevelStep(step.id) ?');
    assert.ok(gate > 0 && gate < component.indexOf('ws-levels'));
  });

  it('every level-dependent step has copy for every level, in EN and VI', () => {
    for (const messages of [en, vi])
      for (const level of AI_LEVELS) {
        assert.ok(messages.aiDemo.levels[level].reply);
        assert.ok(messages.aiDemo.practise[level]);
        assert.ok(messages.aiDemo.check[level]);
      }
  });
});

describe('Logos', () => {
  it('are never rounded, masked or clipped', () => {
    const css = readStyles();
    const rules = [...css.matchAll(/\n([^\n{}]*\bimg\b[^\n{}]*)\{([^}]*)\}/g)];
    assert.ok(rules.length >= 2, 'logo rules found');
    const clips = (body: string) =>
      /border-radius|clip-path|mask-image|overflow:\s*(hidden|clip)/.test(body);
    for (const [, selector, body] of rules)
      assert.ok(!clips(body), `${selector.trim()} clips a logo`);
    // Broken variant: the old rounded logo rule is caught.
    assert.ok(clips('\n  flex: none;\n  border-radius: 12px;\n'));
  });
});
