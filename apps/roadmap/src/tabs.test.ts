/**
 * The roadmap tabs: which tab a URL fragment selects, the roving-focus keys,
 * and the stylesheet's script-free default (run via src/roadmap-data.test.ts).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_TAB,
  fragmentId,
  TAB_IDS,
  tabForFragment,
  tabForKey,
} from './components/tab-model.ts';
import { shownState } from './components/live-label.ts';
import { readStyles } from './style-source.ts';

/** Where old section anchors live now (the page's panels). */
const OWNERS: Record<string, string> = {
  'glance-title': 'overview',
  tracks: 'progress',
  'track-cms': 'progress',
  'timeline-title': 'progress',
  pulse: 'activity',
  updates: 'activity',
  'patch-notes': 'activity',
  'hosting-title': 'infrastructure',
  'migration-title': 'infrastructure',
};
const panelOf = (id: string) => OWNERS[id] ?? null;

describe('tabs: a fragment selects a tab', () => {
  it('a tab id selects itself; no fragment selects Overview', () => {
    assert.deepEqual(TAB_IDS, [
      'overview',
      'progress',
      'activity',
      'infrastructure',
    ]);
    assert.equal(DEFAULT_TAB, 'overview');
    for (const tab of TAB_IDS)
      assert.equal(tabForFragment(`#${tab}`, panelOf), tab);
    assert.equal(tabForFragment('', panelOf), 'overview');
    assert.equal(tabForFragment('#', panelOf), 'overview');
  });

  it('old section links land on the tab that holds the section', () => {
    for (const [id, tab] of Object.entries(OWNERS))
      assert.equal(tabForFragment(`#${id}`, panelOf), tab, id);
    // Broken variant: a resolver that only knows the four tab ids sends
    // #pulse (the hero's "PRs merged" link) to Overview, where it is hidden.
    const tabsOnly = (hash: string) => tabForFragment(hash, () => null);
    assert.notEqual(tabsOnly('#pulse'), 'activity');
  });

  it('anything else selects Overview: unknown, malformed or outside the panels', () => {
    for (const hash of [
      '#garbage',
      '#100%',
      '#%E0%A4%A',
      '#sections',
      '#page-title',
      '#tab-progress',
    ])
      assert.equal(tabForFragment(hash, panelOf), 'overview', hash);
    // A panel name the model does not know is never selected.
    assert.equal(
      tabForFragment('#x', () => 'settings'),
      'overview'
    );
  });

  it('the rule never reads the selection it replaces (a pure function)', () => {
    // The history round trips run through the real component in
    // scripts/tabs-selection.test.mjs; this pins the rule's signature.
    assert.equal(tabForFragment.length, 2);
  });

  it('decodes the fragment and survives a malformed escape', () => {
    assert.equal(fragmentId('#track-cms'), 'track-cms');
    assert.equal(fragmentId('#caf%C3%A9'), 'café');
    assert.equal(fragmentId('#100%'), '100%');
    assert.equal(fragmentId('progress'), 'progress');
  });
});

describe('tabs: roving focus keys (WAI-ARIA tabs)', () => {
  it('arrows move and wrap; Home and End jump; other keys do nothing', () => {
    assert.equal(tabForKey('ArrowRight', 'overview'), 'progress');
    assert.equal(tabForKey('ArrowRight', 'infrastructure'), 'overview');
    assert.equal(tabForKey('ArrowLeft', 'overview'), 'infrastructure');
    assert.equal(tabForKey('ArrowLeft', 'activity'), 'progress');
    assert.equal(tabForKey('Home', 'activity'), 'overview');
    assert.equal(tabForKey('End', 'progress'), 'infrastructure');
    for (const key of ['ArrowUp', 'ArrowDown', 'Tab', 'a', 'Enter'])
      assert.equal(tabForKey(key, 'progress'), null, key);
  });
});

describe('tabs: the right panel paints before any script', () => {
  const css = readStyles();
  /** Selector lists of the rules that hide panels before hydration. */
  const preHydration = (source: string) => {
    const block = /@supports selector\(:has\(\*\)\)\s*\{([^]*?)\}\s*\}/.exec(
      source
    );
    return block?.[1] ?? '';
  };

  it('the fragment, or Overview by default, picks the panel in CSS', () => {
    const rules = preHydration(css);
    assert.match(rules, /\.rm-tabs:not\(\[data-active\]\)/);
    assert.match(rules, /:has\(> \.rm-panel:target, > \.rm-panel :target\)/);
    assert.match(rules, /\.rm-panel:not\(:target\):not\(:has\(:target\)\)/);
    assert.match(rules, /\.rm-panel:not\(\[data-default\]\)/);
    assert.match(rules, /display: none;/);
    // Broken variant: hiding panels outside the :has() guard leaves older
    // browsers with no visible panel at all before hydration.
    assert.equal(preHydration('.rm-panel { display: none; }'), '');
  });

  it('after hydration only the selected panel shows', () => {
    assert.match(
      css,
      /\.rm-tabs\[data-active\] > \.rm-panel:not\(\[data-current\]\) \{\s*display: none;\s*\}/
    );
  });

  it('the selected tab looks the same before and after hydration', () => {
    const preTab = /\.rm-tab\[data-tab="(\w+)"\]::after/g;
    const tabs = new Set([...css.matchAll(preTab)].map((m) => m[1]));
    assert.deepEqual([...tabs].sort(), [...TAB_IDS].sort());
    assert.match(
      css,
      /\.rm-tab\[aria-selected="true"\]::after \{\s*background: var\(--rm-ink\);/
    );
  });
});

describe('hero: the live label describes the data on screen', () => {
  it('a refresh keeps the label of what it runs over', () => {
    assert.equal(shownState('snapshot', 'build'), 'snapshot');
    assert.equal(shownState('refreshing', 'build'), 'snapshot');
    assert.equal(shownState('refreshing', 'live'), 'live');
    assert.equal(shownState('live', 'live'), 'live');
    assert.equal(shownState('failed', 'build'), 'failed');
    // Broken variant: labelling by refresh state alone shows "Snapshot"
    // over live data while the next refresh runs.
    const byState = (state: string) =>
      state === 'refreshing' ? 'snapshot' : state;
    assert.notEqual(byState('refreshing'), shownState('refreshing', 'live'));
  });
});
