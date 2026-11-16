/**
 * Runs the real src/components/tabs.tsx outside a browser: the source is
 * compiled with Vite's own oxc transform, and react, the router and the
 * icons resolve to the small stand-ins below (a hooks runtime that renders
 * the component as a tree of plain objects, a router with a history stack,
 * and a window that fires hashchange only where a browser does). Tests
 * drive it with the location changes a reader causes and read the selected
 * tab from the rendered markup (data-active on the tabs root).
 *
 * TABS_SOURCE_DIR points it at another copy of the component (an older
 * commit), so a regression test can show that it rejects that code.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformWithOxc } from 'vite';

const STUBS = {
  react: `const h = new Proxy({}, { get: (_, key) => globalThis.__tabsHarness[key] });
export const useState = (i) => h.useState(i);
export const useRef = (i) => h.useRef(i);
export const useEffect = (f, d) => h.useEffect(f, d, 'passive');
export const useLayoutEffect = (f, d) => h.useEffect(f, d, 'layout');
export const useCallback = (f, d) => h.useMemo(() => f, d);
export const useMemo = (f, d) => h.useMemo(f, d);
export const Fragment = 'Fragment';
export default { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, Fragment };`,
  'react/jsx-runtime': `export const jsx = (type, props, key) => ({ type, props, key });
export const jsxs = jsx;
export const Fragment = 'Fragment';`,
  '@tanstack/react-router': `const h = new Proxy({}, { get: (_, key) => globalThis.__tabsHarness[key] });
export const useNavigate = () => (options) => h.navigate(options);
export const useRouterState = ({ select }) => select(h.routerState());`,
  '@tuturuuu/icons': `const icon = () => null;
export const Activity = icon, LayoutDashboard = icon, ListChecks = icon, Server = icon;`,
};

/** Where old section anchors live (the page's panels). */
const OWNERS = {
  'glance-title': 'overview',
  tracks: 'progress',
  'track-cms': 'progress',
  pulse: 'activity',
  updates: 'activity',
  'hosting-title': 'infrastructure',
};

let loaded = null;

/** Every temporary module directory this process made (all removed once loaded). */
export const harnessDirs = [];

async function load() {
  if (loaded) return loaded;
  const dir =
    process.env.TABS_SOURCE_DIR ??
    fileURLToPath(
      new URL('../../../packages/roadmap-core/src/components/', import.meta.url)
    );
  const out = mkdtempSync(join(tmpdir(), 'roadmap-tabs-'));
  harnessDirs.push(out);
  try {
    loaded = await compile(dir, out);
  } finally {
    // The modules are evaluated once imported; the files are not needed.
    rmSync(out, { recursive: true, force: true });
  }
  return loaded;
}

async function compile(dir, out) {
  const urls = {};
  for (const [name, code] of Object.entries(STUBS)) {
    const file = join(out, `${name.replace(/[^a-z]/gi, '_')}.mjs`);
    writeFileSync(file, code);
    urls[name] = pathToFileURL(file).href;
  }
  urls['./tab-model'] = pathToFileURL(join(dir, 'tab-model.ts')).href;
  const source = readFileSync(join(dir, 'tabs.tsx'), 'utf8');
  const { code } = await transformWithOxc(source, 'tabs.tsx', {
    lang: 'tsx',
    jsx: { runtime: 'automatic' },
  });
  const linked = code.replace(
    /from\s+(['"])([^'"]+)\1/g,
    (match, quote, spec) => {
      if (!urls[spec]) throw new Error(`tabs harness: unmapped import ${spec}`);
      return `from ${quote}${urls[spec]}${quote}`;
    }
  );
  const file = join(out, 'tabs.mjs');
  writeFileSync(file, linked);
  return import(pathToFileURL(file).href);
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  visit(node);
  walk(node.props?.children, visit);
}

/**
 * A page with the tabs mounted at `initialHash`. Each step returns the
 * selected tab (null before the upgrade).
 */
export async function mountTabs(initialHash = '') {
  const listeners = { hashchange: new Set() };
  const history = { entries: [initialHash], index: 0 };
  const scrolled = [];
  const hooks = [];
  let cursor = 0;
  let tree = null;
  let dirty = false;
  let queue = [];

  const location = () => history.entries[history.index];
  const element = (id) => {
    const tab = /^(overview|progress|activity|infrastructure)$/.test(id)
      ? id
      : OWNERS[id];
    if (!tab) return null;
    return {
      dataset: { panel: tab },
      closest: () => ({ dataset: { panel: tab } }),
      scrollIntoView: () => scrolled.push(id),
      focus: () => {},
    };
  };
  globalThis.window = {
    get location() {
      return { hash: location() ? `#${location()}` : '' };
    },
    addEventListener: (type, fn) => listeners[type]?.add(fn),
    removeEventListener: (type, fn) => listeners[type]?.delete(fn),
  };
  globalThis.document = {
    getElementById: element,
    querySelector: () => null,
  };

  const harness = {
    useState(initial) {
      const slot = cursor++;
      if (!(slot in hooks))
        hooks[slot] = {
          value: typeof initial === 'function' ? initial() : initial,
        };
      const cell = hooks[slot];
      return [
        cell.value,
        (next) => {
          const value = typeof next === 'function' ? next(cell.value) : next;
          if (!Object.is(value, cell.value)) {
            cell.value = value;
            dirty = true;
          }
        },
      ];
    },
    useRef(initial) {
      const slot = cursor++;
      if (!(slot in hooks)) hooks[slot] = { current: initial };
      return hooks[slot];
    },
    useMemo(make, deps) {
      const slot = cursor++;
      const cell = hooks[slot];
      if (cell && deps && deps.every((d, i) => Object.is(d, cell.deps[i])))
        return cell.value;
      hooks[slot] = { value: make(), deps };
      return hooks[slot].value;
    },
    useEffect(fn, deps, phase) {
      const slot = cursor++;
      const cell = hooks[slot];
      if (cell && deps && deps.every((d, i) => Object.is(d, cell.deps[i])))
        return;
      queue.push({ slot, fn, deps, phase });
    },
    navigate(options) {
      const hash = String(options.hash ?? '');
      if (options.replace) history.entries[history.index] = hash;
      else {
        history.entries.splice(history.index + 1, Infinity, hash);
        history.index += 1;
      }
      // A router navigation writes history without a native hashchange.
      render();
      return Promise.resolve();
    },
    routerState: () => ({ location: { hash: location() } }),
  };
  globalThis.__tabsHarness = harness;
  const { RoadmapTabs } = await load();

  function render() {
    for (let pass = 0; pass < 50; pass += 1) {
      cursor = 0;
      dirty = false;
      queue = [];
      tree = RoadmapTabs({
        label: 'Sections',
        labels: {
          overview: 'Overview',
          progress: 'Progress',
          activity: 'Activity',
          infrastructure: 'Infrastructure',
        },
        panels: {},
        path: '/',
      });
      for (const phase of ['layout', 'passive'])
        for (const effect of queue.filter((e) => e.phase === phase)) {
          hooks[effect.slot]?.cleanup?.();
          const cleanup = effect.fn();
          hooks[effect.slot] = {
            deps: effect.deps,
            cleanup: typeof cleanup === 'function' ? cleanup : undefined,
          };
        }
      if (!dirty) return;
    }
    throw new Error('tabs harness: render did not settle');
  }

  const selected = () => {
    let active = null;
    walk(tree, (node) => {
      if (node.props?.className === 'rm-tabs')
        active = node.props['data-active'] ?? null;
    });
    return active;
  };
  /** The browser fires hashchange when a navigation changes the fragment. */
  const moved = (change) => {
    const before = location();
    change();
    if (location() !== before) for (const fn of [...listeners.hashchange]) fn();
  };
  const step = (run) => {
    run();
    render();
    return selected();
  };

  render();
  return {
    selected,
    scrolled,
    /** Click a tab in the bar (an unmodified primary click). */
    click: (tab) =>
      step(() => {
        let link = null;
        walk(tree, (node) => {
          if (node.props?.id === `tab-${tab}`) link = node;
        });
        link.props.onClick({
          button: 0,
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          preventDefault() {},
        });
      }),
    /** A router navigation that changes only the hash (a <Link hash>). */
    routerNavigate: (hash) => step(() => harness.navigate({ hash })),
    /** A plain fragment link: the browser fires hashchange and popstate. */
    fragmentLink: (hash) =>
      step(() =>
        moved(() => {
          history.entries.splice(history.index + 1, Infinity, hash);
          history.index += 1;
        })
      ),
    back: () =>
      step(() =>
        moved(() => {
          history.index -= 1;
        })
      ),
    forward: () =>
      step(() =>
        moved(() => {
          history.index += 1;
        })
      ),
    location,
  };
}
