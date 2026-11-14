/**
 * D79 tests for the boot script (src/boot/roadmap-boot.js): the hydration
 * loader and lite mode, run in a sandbox with a fake document (via
 * src/roadmap-data.test.ts). Each check runs the real script and a broken
 * variant that must fail it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import {
  DEFERRED_ENTRY_ATTRIBUTE,
  DEFERRED_PRELOAD_REL,
  FALLBACK_MS,
  IDLE_TIMEOUT_MS,
  INTENT_EVENTS,
} from './defer-hydration.ts';
import { isLiteDevice } from './lite-mode.ts';

const BOOT = readFileSync(
  new URL('./boot/roadmap-boot.js', import.meta.url),
  'utf8'
);

type Fn = (...args: unknown[]) => unknown;

/** Run `source` against a fake page; returns handles to drive it. */
function boot(source: string, navigator: object = {}) {
  const listeners = new Map<string, Fn[]>();
  const imports: string[] = [];
  const idle: { run: Fn; timeout?: number }[] = [];
  const frames: Fn[] = [];
  const timers: { run: Fn; ms: number }[] = [];
  let paint: Fn = () => {};
  let finishImport: Fn = () => {};
  const appended: unknown[] = [];
  const attributes = new Map<string, string>();
  const context = {
    navigator,
    document: {
      readyState: 'complete',
      addEventListener() {},
      documentElement: {
        setAttribute: (name: string, value: string) =>
          attributes.set(name, value),
      },
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
    attributes,
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
  const attrs = new Map<string, string>();
  const button = {
    isConnected: true,
    clicks: 0,
    parentNode: null,
    setAttribute: (name: string, value: string) => attrs.set(name, value),
    removeAttribute: (name: string) => attrs.delete(name),
    hasAttribute: (name: string) => attrs.has(name),
    attrs,
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
    const page = boot(BOOT);
    assert.deepEqual(page.imports, []);
    assert.equal(page.idle.length, 0);
  });

  it('the first pointerdown, touchstart, keydown or focusin starts it, once', () => {
    assert.equal(startsOnIntent(BOOT), true);
    // Broken variant: a loader that ignores intent waits for the paint.
    const noIntent = BOOT.replace(
      "var INTENTS = ['pointerdown', 'touchstart', 'keydown', 'focusin'];",
      'var INTENTS = [];'
    );
    assert.notEqual(noIntent, BOOT);
    assert.equal(startsOnIntent(noIntent), false);
  });

  it('after the largest contentful paint it loads in an idle period, within 1 s', () => {
    const page = boot(BOOT);
    page.paint();
    assert.equal(page.idle.length, 1);
    assert.ok((page.idle[0]?.timeout ?? Infinity) <= IDLE_TIMEOUT_MS);
    assert.ok(IDLE_TIMEOUT_MS <= 1_000);
    page.idle[0]?.run();
    page.runFrames();
    assert.equal(page.imports.length, 1);
  });

  it('the first click on a button is replayed once React has hydrated it', async () => {
    assert.equal(await replaysFirstClick(BOOT), true);
    // Broken variant: without the click recorder the first tap is lost.
    const noReplay = BOOT.replace(
      "addEventListener(\n    'click',",
      "void(\n    'click',"
    );
    assert.notEqual(noReplay, BOOT);
    assert.equal(await replaysFirstClick(noReplay), false);
  });

  it('a popover button (an (i) or a tooltip) opens natively on the first tap', () => {
    /** True when the boot script neither holds nor replays the tap. */
    const native = (source: string) => {
      const page = boot(source);
      const button = fakeButton();
      button.setAttribute('popovertarget', 'status-method');
      let stopped = false;
      page.fire('click', {
        target: button,
        stopImmediatePropagation: () => {
          stopped = true;
        },
      });
      button.hydrate();
      page.runFrames();
      return (
        !stopped &&
        button.clicks === 0 &&
        !button.attrs.has('data-roadmap-pending')
      );
    };
    assert.equal(native(BOOT), true);
    // Broken variant: held and replayed, the replayed click toggles the
    // popover the native tap opened shut again.
    const held = BOOT.replace("button.hasAttribute('popovertarget') || ", '');
    assert.notEqual(held, BOOT);
    assert.equal(native(held), false);
  });

  it('links and other elements are left to the browser', () => {
    const page = boot(BOOT);
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

describe('perf: the boot script matches the documented contract', () => {
  it('uses the same intents, timeouts and attributes as defer-hydration.ts', () => {
    assert.ok(
      BOOT.includes(
        `var INTENTS = ${JSON.stringify(INTENT_EVENTS).replaceAll('"', "'").replaceAll(',', ', ')};`
      )
    );
    assert.ok(BOOT.includes(`var IDLE_TIMEOUT_MS = ${IDLE_TIMEOUT_MS};`));
    assert.ok(BOOT.includes(`var FALLBACK_MS = ${FALLBACK_MS};`));
    assert.ok(BOOT.includes(`link[rel="${DEFERRED_PRELOAD_REL}"]`));
    assert.ok(BOOT.includes(`script[${DEFERRED_ENTRY_ATTRIBUTE}]`));
    assert.ok(!/prefetch|prerender|speculationrules/i.test(BOOT));
    assert.ok(!BOOT.includes('/roadmap/assets/'));
  });

  it('a held tap shows as pressed at once, before hydration', () => {
    const page = boot(BOOT);
    const button = fakeButton();
    button.setAttribute('aria-pressed', 'false');
    page.fire('click', { target: button, stopImmediatePropagation() {} });
    assert.equal(button.attrs.get('aria-pressed'), 'true');
    assert.ok(button.attrs.has('data-roadmap-pending'));
  });
});

describe('perf: lite mode is decided before the first paint', () => {
  const devices = [
    { hardwareConcurrency: 4, deviceMemory: 8 },
    { hardwareConcurrency: 8, deviceMemory: 2 },
    { hardwareConcurrency: 8, deviceMemory: 8, connection: { saveData: true } },
    { hardwareConcurrency: 12, deviceMemory: 8 },
    {},
  ];
  const lite = (source: string, device: object) =>
    boot(source, device).attributes.has('data-lite');

  it('the boot script and the pure decision agree on every device', () => {
    assert.deepEqual(
      devices.map((device) => isLiteDevice(device)),
      [true, true, true, false, false]
    );
    for (const device of devices)
      assert.equal(lite(BOOT, device), isLiteDevice(device));
    // Broken variant: a script with the wrong threshold disagrees.
    const broken = BOOT.replace(
      '(cores && cores <= 4)',
      '(cores && cores <= 2)'
    );
    assert.notEqual(broken, BOOT);
    assert.ok(devices.some((d) => lite(broken, d) !== isLiteDevice(d)));
  });

  it('the boot script is async, so it never blocks the first paint', () => {
    assert.match(
      readFileSync(new URL('./boot.ts', import.meta.url), 'utf8'),
      /return \{ src: bootUrl, async: true \};/
    );
  });

  it('both page heads render the boot script ahead of everything else they add', () => {
    for (const head of ['./pages/roadmap-head.ts', './pages/edufest-head.ts'])
      assert.match(
        readFileSync(new URL(head, import.meta.url), 'utf8'),
        /scripts: \[\s*bootScript\(\),/,
        head
      );
  });
});
