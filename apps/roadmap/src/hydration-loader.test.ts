/**
 * D79 tests for the inline hydration loader (src/defer-hydration.ts), run in
 * a sandbox with a fake document (via src/roadmap-data.test.ts). Each check
 * runs the real loader and a broken variant that must fail it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import {
  HYDRATION_LOADER,
  IDLE_TIMEOUT_MS,
  INTENT_EVENTS,
} from './defer-hydration.ts';

type Fn = (...args: unknown[]) => unknown;

/** Run `source` against a fake page; returns handles to drive it. */
function boot(source: string) {
  const listeners = new Map<string, Fn[]>();
  const imports: string[] = [];
  const idle: { run: Fn; timeout?: number }[] = [];
  const frames: Fn[] = [];
  const timers: { run: Fn; ms: number }[] = [];
  let paint: Fn = () => {};
  let finishImport: Fn = () => {};
  const appended: unknown[] = [];
  const context = {
    document: {
      currentScript: { remove() {} },
      head: { append: (node: unknown) => appended.push(node) },
      querySelectorAll: () => [
        { getAttribute: () => '/roadmap/assets/roadmap-Abcd1234.js' },
      ],
      querySelector: () => ({
        getAttribute: () => '/roadmap/assets/index-Abcd1234.js',
      }),
      createElement: () => ({}),
    },
    window: {
      requestIdleCallback: (run: Fn, options?: { timeout?: number }) =>
        idle.push({ run, timeout: options?.timeout }),
    },
    addEventListener: (type: string, fn: Fn) =>
      listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    removeEventListener: (type: string, fn: Fn) =>
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((entry) => entry !== fn)
      ),
    requestAnimationFrame: (fn: Fn) => frames.push(fn),
    setTimeout: (run: Fn, ms: number) => timers.push({ run, ms }),
    PerformanceObserver: class {
      static supportedEntryTypes = ['largest-contentful-paint', 'paint'];
      constructor(callback: Fn) {
        paint = () => callback({}, this);
      }
      observe() {}
      disconnect() {}
    },
    __import: (src: string) => {
      imports.push(src);
      return new Promise((resolve) => {
        finishImport = resolve as Fn;
      });
    },
  };
  // `import()` is syntax; the sandbox routes it through a recorder.
  vm.runInNewContext(source.replace('import(', '__import('), context);
  return {
    imports,
    idle,
    appended,
    fire: (type: string, event: object = {}) => {
      for (const fn of [...(listeners.get(type) ?? [])]) fn(event);
    },
    paint: () => paint(),
    finishImport: async () => {
      finishImport();
      await new Promise((resolve) => setImmediate(resolve));
    },
    /** Run queued frames and short timers (never the fallback cap). */
    runFrames: (limit = 50) => {
      for (let i = 0; i < limit; i += 1) {
        const frame = frames.shift();
        if (frame) frame();
        const index = timers.findIndex((timer) => timer.ms < 1_000);
        const timer = index < 0 ? undefined : timers.splice(index, 1)[0];
        if (timer) timer.run();
        if (!frame && !timer) break;
      }
    },
  };
}

/** A fake <button>; `hydrate()` attaches React props the way React DOM does. */
function fakeButton() {
  const button = {
    isConnected: true,
    clicks: 0,
    click() {
      button.clicks += 1;
    },
    closest: (selector: string) => (selector === 'button' ? button : null),
    hydrate() {
      (button as Record<string, unknown>).__reactProps$abc = {};
    },
  };
  return button;
}

/** True when any intent event starts exactly one bundle import. */
function startsOnIntent(source: string) {
  return INTENT_EVENTS.every((type) => {
    const page = boot(source);
    if (page.imports.length) return false;
    page.fire(type);
    // The fetch starts at once; the import waits a frame so the tap paints.
    const fetchedAtOnce = page.appended.length === 1 && !page.imports.length;
    page.fire(type);
    page.fire('pointerdown');
    page.runFrames();
    return (
      fetchedAtOnce && page.imports.length === 1 && page.appended.length === 1
    );
  });
}

/** True when the first click on an unhydrated button runs once, after hydration. */
async function replaysFirstClick(source: string) {
  const page = boot(source);
  const button = fakeButton();
  let stopped = false;
  page.fire('click', {
    target: button,
    stopImmediatePropagation: () => {
      stopped = true;
    },
  });
  page.runFrames(3);
  const clicks = () => button.clicks;
  if (clicks() !== 0 || page.imports.length !== 1) return false;
  await page.finishImport();
  button.hydrate();
  page.runFrames();
  page.runFrames();
  return stopped && clicks() === 1;
}

describe('perf: the bundle loads at the first intent or just after the LCP', () => {
  it('nothing loads before an intent or a paint is reported', () => {
    const page = boot(HYDRATION_LOADER);
    assert.deepEqual(page.imports, []);
    assert.equal(page.idle.length, 0);
  });

  it('the first pointerdown, touchstart, keydown or focusin starts it, once', () => {
    assert.equal(startsOnIntent(HYDRATION_LOADER), true);
    // Broken variant: a loader that ignores intent waits for the paint.
    const noIntent = HYDRATION_LOADER.replace(
      JSON.stringify(INTENT_EVENTS),
      '[]'
    );
    assert.notEqual(noIntent, HYDRATION_LOADER);
    assert.equal(startsOnIntent(noIntent), false);
  });

  it('after the largest contentful paint it loads in an idle period, within 1 s', () => {
    const page = boot(HYDRATION_LOADER);
    page.paint();
    assert.equal(page.idle.length, 1);
    assert.ok((page.idle[0]?.timeout ?? Infinity) <= IDLE_TIMEOUT_MS);
    assert.ok(IDLE_TIMEOUT_MS <= 1_000);
    page.idle[0]?.run();
    page.runFrames();
    assert.equal(page.imports.length, 1);
  });

  it('the first click on a button is replayed once React has hydrated it', async () => {
    assert.equal(await replaysFirstClick(HYDRATION_LOADER), true);
    // Broken variant: without the click recorder the first tap is lost.
    const noReplay = HYDRATION_LOADER.replace(
      "addEventListener('click',",
      "void('click',"
    );
    assert.notEqual(noReplay, HYDRATION_LOADER);
    assert.equal(await replaysFirstClick(noReplay), false);
  });

  it('links and other elements are left to the browser', () => {
    const page = boot(HYDRATION_LOADER);
    let stopped = false;
    page.fire('click', {
      target: { closest: () => null },
      stopImmediatePropagation: () => {
        stopped = true;
      },
    });
    assert.equal(stopped, false);
  });
});
