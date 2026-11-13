/**
 * D79 performance guards for the roadmap and EduFest pages (run via
 * src/roadmap-data.test.ts). Each guard is checked against the real source
 * and against a broken variant that must fail.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  heavyEffectFailures,
  infiniteAnimationFailures,
  layoutAnimationFailures,
} from './css-guards.ts';
import {
  DEFERRED_ENTRY_ATTRIBUTE,
  DEFERRED_PRELOAD_REL,
  deferHydration,
} from './defer-hydration.ts';
import { loadHistoryWhenNear, type Observe } from './history/lazy-load.ts';
import { periodChipName, scrubberWindow } from './history/timeline.ts';
import { inlineScriptTexts } from './html-scripts.ts';
import { afterIdleAndVisible, type DeferEnv } from './live/defer.ts';
import { fetchPullFacts } from './live/github.ts';
import { isRateLimited, LIVE_SEARCH } from './live/use-live-data.ts';

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('./styles.css');

describe('perf: expensive CSS stays off phones and low-end devices', () => {
  it('runs no infinite animation outside reduced-motion on a wide, non-lite screen', () => {
    assert.deepEqual(infiniteAnimationFailures(css), []);
    // Broken variants: the drifting hero blooms and an unguarded caret.
    const broken = [
      '.bloom { animation: drift 18s ease-in-out infinite alternate; }',
      '@media (prefers-reduced-motion: no-preference) { .ws-caret { animation: ws-caret 1.1s steps(1) infinite; } }',
      '@media (min-width: 1024px) and (prefers-reduced-motion: no-preference) { .ws-caret { animation: x 1s infinite; } }',
    ];
    for (const sample of broken)
      assert.equal(infiniteAnimationFailures(sample).length, 1, sample);
  });

  it('uses no backdrop-filter, blend mode or blur in lite mode or on small screens', () => {
    assert.deepEqual(heavyEffectFailures(css), []);
    const broken = [
      '.ws-stage-window { backdrop-filter: blur(10px); }',
      '.bloom { filter: blur(64px); }',
      '.ws-hero-wash::after { mix-blend-mode: overlay; background: url("data:image/svg+xml;utf8,<svg a=\'1;2\'/>"); }',
      '@media (min-width: 1024px) { .sticky-bar { backdrop-filter: blur(12px); } }',
    ];
    for (const sample of broken)
      assert.equal(heavyEffectFailures(sample).length, 1, sample);
  });

  it('turns the shared navbar blur off below desktop and in lite mode', () => {
    const tiers = css.slice(css.indexOf('/* The shared navbar blurs'));
    assert.match(
      tiers,
      /@media \(max-width: 1023px\)[\s\S]*?\.backdrop-blur-xl[\s\S]*?backdrop-filter: none/
    );
    assert.match(
      tiers,
      /html\[data-lite\] \.roadmap \.backdrop-blur-xl \{[\s\S]*?backdrop-filter: none/
    );
  });

  it('animates no layout property (height, width, top) in transitions or keyframes', () => {
    assert.deepEqual(layoutAnimationFailures(css), []);
    assert.equal(
      layoutAnimationFailures(
        '.chip-period .bar span { transition: height 0.35s cubic-bezier(0.2, 0.8, 0.2, 1); }'
      ).length,
      1
    );
    assert.equal(
      layoutAnimationFailures('@keyframes ws-timer { from { width: 100%; } }')
        .length,
      1
    );
  });

  it('skips rendering below-the-fold sections with a remembered height only', () => {
    const rule =
      /([^{}]*)\{\s*content-visibility: auto;\s*contain-intrinsic-block-size: auto \d+px;\s*\}/.exec(
        css
      );
    assert.ok(rule, 'content-visibility rule');
    for (const selector of ['.page > .section:not(#tracks)', '.track'])
      assert.ok(rule[1]?.includes(selector), selector);
    // Broken variant: the two-axis shorthand gives skipped cards a 720px
    // width, which widened the track column past a 390px phone.
    const widens = (sample: string) =>
      /contain-intrinsic-size:\s*(auto\s+)?\d+px\s*;/.test(sample) ||
      /contain-intrinsic-(width|inline-size):/.test(sample);
    assert.equal(widens(css), false);
    assert.equal(
      widens('.track { contain-intrinsic-size: auto 720px; }'),
      true
    );
  });
});

describe('perf: the history JSON loads only when the timeline nears the viewport', () => {
  function harness(observe: Observe) {
    const requests: string[] = [];
    let near: (() => void) | null = null;
    const watching: Observe = (element, onNear) => {
      near = onNear;
      return observe(element, onNear);
    };
    loadHistoryWhenNear(
      {} as Element,
      { onLoading() {}, onLoaded() {}, onFailed() {} },
      '/roadmap/assets/history-Abcd1234.json',
      watching,
      async (url) => {
        requests.push(url);
        return new Response('{}', { status: 500 });
      }
    );
    return { requests, scroll: () => near?.() };
  }
  const lazy: Observe = () => () => {};

  it('requests nothing on load and exactly once when the timeline is near', () => {
    const { requests, scroll } = harness(lazy);
    assert.deepEqual(requests, []);
    scroll();
    assert.deepEqual(requests, ['/roadmap/assets/history-Abcd1234.json']);
  });

  it('D79 broken variant: an eager loader is caught before the timeline is visible', () => {
    const eager: Observe = (_element, onNear) => {
      onNear();
      return undefined;
    };
    assert.equal(harness(eager).requests.length, 1);
  });

  it('the hook fetches only through the observed loader', () => {
    const hook = read('./history/use-history.ts');
    assert.ok(!/\bfetch\(/.test(hook), 'use-history.ts calls fetch directly');
    assert.match(hook, /loadHistoryWhenNear\(/);
    assert.match(read('./history/lazy-load.ts'), /new IntersectionObserver\(/);
  });
});

describe('perf: the live GitHub refresh waits and stays bounded', () => {
  function fakeEnv(readyState: string, visibilityState: string) {
    const listeners = new Map<string, () => void>();
    const target = {
      addEventListener: (type: string, fn: () => void) =>
        listeners.set(type, fn),
      removeEventListener: (type: string) => listeners.delete(type),
    };
    const idle: (() => void)[] = [];
    const env = {
      document: { ...target, readyState, visibilityState },
      window: {
        ...target,
        requestIdleCallback: (fn: () => void) => idle.push(fn),
        setTimeout: () => 0,
        clearTimeout() {},
      },
    } as unknown as DeferEnv;
    return { env, listeners, idle };
  }

  type Scheduler = (task: () => void, env: DeferEnv) => () => void;
  /** True when `schedule` waits for load, visibility and an idle period. */
  function waitsForIdleAndVisible(schedule: Scheduler) {
    const { env, listeners, idle } = fakeEnv('loading', 'hidden');
    let ran = 0;
    schedule(() => (ran += 1), env);
    if (ran) return false;
    listeners.get('load')?.();
    if (ran || idle.length) return false;
    (env.document as { visibilityState: string }).visibilityState = 'visible';
    listeners.get('visibilitychange')?.();
    if (ran) return false;
    idle.shift()?.();
    return ran === 1;
  }

  it('runs only after load, while visible, in an idle period', () => {
    assert.equal(waitsForIdleAndVisible(afterIdleAndVisible), true);
  });

  it('D79 broken variant: refreshing on mount is caught', () => {
    const onMount: Scheduler = (task) => {
      task();
      return () => {};
    };
    assert.equal(waitsForIdleAndVisible(onMount), false);
  });

  it('one refresh makes at most four search requests (anonymous limit is ten a minute)', async () => {
    const count = async (options: Parameters<typeof fetchPullFacts>[2]) => {
      let calls = 0;
      const fetcher = async () => {
        calls += 1;
        const items = Array.from({ length: 100 }, (_, i) => ({
          number: calls * 1000 + i,
          title: 'feat: x',
          state: 'open',
        }));
        return Response.json({ total_count: 1000, items });
      };
      await fetchPullFacts(
        fetcher,
        Date.parse('2026-11-10T00:00:00Z'),
        options
      );
      return calls;
    };
    assert.ok((await count(LIVE_SEARCH)) <= 4);
    // Broken variant: the old browser bounds made eight requests.
    assert.ok((await count({ days: 8, mergedPages: 4 })) > 4);
  });

  it('recognises GitHub rate limits, so the browser backs off', () => {
    assert.equal(
      isRateLimited(new Error('GitHub 403 for /search/issues')),
      true
    );
    assert.equal(
      isRateLimited(new Error('GitHub 429 for /search/issues')),
      true
    );
    assert.equal(
      isRateLimited(new Error('GitHub 500 for /search/issues')),
      false
    );
  });
});

describe('perf: the served document fetches no module before paint or intent', () => {
  const html =
    '<head><link rel="modulepreload" href="/roadmap/assets/index-Abcd1234.js" fetchPriority="low"/>' +
    '<link rel="modulepreload" href="/roadmap/assets/roadmap-Abcd1234.js" fetchPriority="low"/></head>' +
    '<body><main>page</main><script type="module" async="" src="/roadmap/assets/index-Abcd1234.js"></script></body>';
  const early = (doc: string) =>
    /rel="modulepreload"|<script type="module"[^>]*\bsrc=/.test(doc);

  it('leaves no module fetch in the served document and keeps every reference', () => {
    const served = deferHydration(html);
    assert.equal(early(served), false);
    assert.equal(
      served.split(`<link rel="${DEFERRED_PRELOAD_REL}"`).length - 1,
      2
    );
    assert.match(
      served,
      new RegExp(
        `<script type="text/plain" ${DEFERRED_ENTRY_ATTRIBUTE}="" src="/roadmap/assets/index-Abcd1234.js"></script>`
      )
    );
    // Attributes change; no element (and so no inline script) is added.
    assert.deepEqual(inlineScriptTexts(served), []);
    assert.equal(served.split('<script').length, html.split('<script').length);
    // Broken variant: an untouched document fetches modules before paint.
    assert.equal(early(html), true);
  });

  it('adds no inline script, so the CSP keeps the four the router renders', () => {
    const inserting = (doc: string) =>
      deferHydration(doc).replace('</body>', '<script>boot()</script></body>');
    // Broken variant: a transform that inserts an inline loader.
    assert.equal(inlineScriptTexts(inserting(html)).length, 1);
    assert.match(
      read('./worker.ts'),
      /withContentSecurityPolicy\(response, deferHydration\)/
    );
  });
});

describe('perf and a11y: the timeline scrubber', () => {
  const periods = Array.from({ length: 213 }, (_, i) => ({
    key: `p${String(i).padStart(3, '0')}`,
  }));

  it('renders a bounded window that always holds the selected period', () => {
    for (const selected of ['p000', 'p100', 'p212', 'missing']) {
      const shown = scrubberWindow(periods, selected);
      assert.ok(shown.length <= 24, `${selected}: ${shown.length}`);
      if (selected !== 'missing')
        assert.ok(
          shown.some((p) => p.key === selected),
          selected
        );
    }
    assert.equal(scrubberWindow(periods, 'missing').at(-1)?.key, 'p212');
    const bounded = (
      window: (list: typeof periods, key: string) => unknown[]
    ) =>
      ['p000', 'p100', 'p212'].every(
        (key) => window(periods, key).length <= 24
      );
    assert.equal(bounded(scrubberWindow), true);
    // Broken variant: rendering every period is caught.
    assert.equal(
      bounded((list) => list),
      false
    );
  });

  it('names each chip starting with its visible label (label-content-name-mismatch)', () => {
    const words = { changeOne: 'change', changes: 'changes' };
    const name = periodChipName('Now', '2026-W46', 334, words);
    assert.equal(name, 'Now, 2026-W46: 334 changes');
    assert.ok(name.startsWith('Now'));
    assert.equal(periodChipName('2025', '2025', 1, words), '2025: 1 change');
    // Broken variant: the key-first name does not start with "Now".
    const old = `2026-W46: 334 ${words.changes}`;
    assert.equal(old.startsWith('Now'), false);
  });
});

describe('perf: hydration is split into section boundaries', () => {
  /** Components that `source` renders directly inside a <Suspense>. */
  const wrapped = (source: string) =>
    [...source.matchAll(/<Suspense(?: key=\{[^}]+\})?>\s*<(\w+)/g)].map(
      (match) => match[1]
    );

  it('wraps the timeline, every track card and each EduFest section below the hero', () => {
    assert.ok(wrapped(read('./pages/roadmap.tsx')).includes('TimelineSection'));
    assert.ok(wrapped(read('./pages/roadmap.tsx')).includes('HostingSection'));
    assert.deepEqual(wrapped(read('./components/tracks.tsx')), ['TrackCard']);
    const edufest = wrapped(read('./pages/edufest.tsx'));
    for (const section of ['WsSimulator', 'WsCapabilities', 'WsFaq'])
      assert.ok(edufest.includes(section), section);
    assert.ok(!edufest.includes('WsHero'), 'the hero hydrates with the shell');
    // Broken variant: one unsplit list hydrates as a single long task.
    assert.deepEqual(
      wrapped('{visible.map((t) => <TrackCard key={t.id} />)}'),
      []
    );
  });
});

describe('perf: the entry chunk names the hashed history asset', () => {
  it('the roadmap head links it (no fetch), so its URL lives in the entry chunk', () => {
    const head = read('./pages/roadmap-head.ts');
    assert.match(head, /historyAlternateLink\(\),/);
    const link = read('./history/history-url.ts');
    assert.match(link, /rel: 'alternate',\s*type: 'application\/json'/);
    assert.ok(!/prefetch|preload|prerender/.test(link));
    // The timeline reads the same module, so both share one URL.
    assert.match(
      read('./history/use-history.ts'),
      /import \{ historyUrl \} from '\.\/history-url\.ts';/
    );
  });
});
