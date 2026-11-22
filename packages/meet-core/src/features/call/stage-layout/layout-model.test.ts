import { describe, expect, it } from 'vitest';
import { layoutGeometry } from './layout-geometry';
import {
  activateTab,
  closeActivity,
  countPanes,
  EMPTY_LAYOUT,
  findPane,
  fitLayout,
  focusedActivity,
  isActivityOpen,
  MAX_PANES,
  maximizePane,
  movePane,
  moveTab,
  openActivities,
  openActivity,
  paneLeaves,
  paneOfActivity,
  pruneLayout,
  resetBoundary,
  resizeBoundary,
  type StageLayout,
  swapPanes,
} from './layout-model';

const desktop = { maxPanes: MAX_PANES.desktop };
const open = (layout: StageLayout, ...ids: string[]) =>
  ids.reduce((next, id) => openActivity(next, id, desktop), layout);
const tabsOf = (layout: StageLayout) =>
  paneLeaves(layout.root).map((pane) => pane.tabs);

describe('opening activities', () => {
  it('starts with one pane and splits beside the focused pane', () => {
    const one = open(EMPTY_LAYOUT, 'a');
    expect(countPanes(one)).toBe(1);
    const two = open(one, 'b');
    expect(tabsOf(two)).toEqual([['a'], ['b']]);
    expect(two.root?.kind === 'split' && two.root.axis).toBe('row');
    expect(focusedActivity(two)).toBe('b');
  });

  it('nests the third pane across the second, up to three panes', () => {
    const three = open(EMPTY_LAYOUT, 'a', 'b', 'c');
    expect(countPanes(three)).toBe(3);
    expect(tabsOf(three)).toEqual([['a'], ['b'], ['c']]);
    const root = three.root;
    expect(root?.kind === 'split' && root.children[1]?.kind).toBe('split');
    expect(layoutGeometry(three).boundaries).toHaveLength(2);
  });

  it('stacks every activity past the pane limit as tabs of the focused pane', () => {
    const full = open(EMPTY_LAYOUT, 'a', 'b', 'c', 'd', 'e');
    expect(countPanes(full)).toBe(3);
    expect(tabsOf(full)).toEqual([['a'], ['b'], ['c', 'd', 'e']]);
    expect(focusedActivity(full)).toBe('e');
    expect(openActivities(full)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('respects a smaller pane limit and an explicit tab placement', () => {
    const tablet = ['a', 'b', 'c'].reduce(
      (next, id) => openActivity(next, id, { maxPanes: MAX_PANES.tablet }),
      EMPTY_LAYOUT
    );
    expect(tabsOf(tablet)).toEqual([['a'], ['b', 'c']]);
    const phone = openActivity(open(EMPTY_LAYOUT, 'a'), 'b', {
      maxPanes: MAX_PANES.phone,
    });
    expect(tabsOf(phone)).toEqual([['a', 'b']]);
    const stacked = openActivity(open(EMPTY_LAYOUT, 'a'), 'b', {
      ...desktop,
      placement: 'tab',
    });
    expect(tabsOf(stacked)).toEqual([['a', 'b']]);
  });

  it('focuses an activity that is already open, in its own pane and tab', () => {
    const layout = open(EMPTY_LAYOUT, 'a', 'b', 'c', 'd');
    const hiddenTab = paneOfActivity(layout, 'c');
    expect(hiddenTab?.active).toBe('d');
    const summoned = openActivity(layout, 'c', desktop);
    expect(countPanes(summoned)).toBe(3);
    expect(summoned.focusedPaneId).toBe(hiddenTab?.id);
    expect(focusedActivity(summoned)).toBe('c');
    const first = openActivity(summoned, 'a', desktop);
    expect(focusedActivity(first)).toBe('a');
  });

  it('moves a maximized view to the pane that is summoned, and restores on a new pane', () => {
    const layout = open(EMPTY_LAYOUT, 'a', 'b');
    const maximized = maximizePane(
      layout,
      paneOfActivity(layout, 'a')?.id ?? ''
    );
    const summoned = openActivity(maximized, 'b', desktop);
    expect(summoned.maximizedPaneId).toBe(paneOfActivity(summoned, 'b')?.id);
    const added = openActivity(maximized, 'c', desktop);
    expect(added.maximizedPaneId).toBeNull();
    expect(countPanes(added)).toBe(3);
  });
});

describe('closing activities', () => {
  it('closes a tab and activates its neighbour', () => {
    const stacked = open(EMPTY_LAYOUT, 'a', 'b', 'c', 'd', 'e');
    const pane = paneOfActivity(stacked, 'e');
    const closed = closeActivity(stacked, 'e');
    expect(tabsOf(closed)).toEqual([['a'], ['b'], ['c', 'd']]);
    expect(findPane(closed, pane?.id ?? '')?.active).toBe('d');
  });

  it('removes an emptied pane, hands its space on and flattens the split', () => {
    const three = open(EMPTY_LAYOUT, 'a', 'b', 'c');
    const two = closeActivity(three, 'b');
    expect(tabsOf(two)).toEqual([['a'], ['c']]);
    expect(
      two.root?.kind === 'split' && two.root.sizes.reduce((a, b) => a + b)
    ).toBeCloseTo(100);
    const one = closeActivity(two, 'a');
    expect(one.root?.kind).toBe('pane');
    expect(focusedActivity(one)).toBe('c');
    expect(closeActivity(one, 'c').root).toBeNull();
  });

  it('ignores an activity that is not open and clears a maximized pane that closes', () => {
    const layout = open(EMPTY_LAYOUT, 'a', 'b');
    expect(closeActivity(layout, 'zzz')).toBe(layout);
    const maximized = maximizePane(
      layout,
      paneOfActivity(layout, 'b')?.id ?? ''
    );
    expect(closeActivity(maximized, 'b').maximizedPaneId).toBeNull();
  });
});

describe('maximizing and restoring', () => {
  it('restores the exact split it left', () => {
    const resized = resizeBoundary(
      open(EMPTY_LAYOUT, 'a', 'b', 'c'),
      layoutGeometry(open(EMPTY_LAYOUT, 'a', 'b', 'c')).boundaries[0]
        ?.splitId ?? '',
      0,
      62
    );
    const before = JSON.stringify(resized.root);
    const paneId = paneOfActivity(resized, 'b')?.id ?? '';
    const maximized = maximizePane(resized, paneId);
    expect(maximized.maximizedPaneId).toBe(paneId);
    expect(openActivities(maximized)).toEqual(openActivities(resized));
    const restored = maximizePane(maximized, null);
    expect(restored.maximizedPaneId).toBeNull();
    expect(JSON.stringify(restored.root)).toBe(before);
  });
});

describe('reordering', () => {
  it('moves a pane earlier or later and swaps panes', () => {
    const layout = open(EMPTY_LAYOUT, 'a', 'b', 'c');
    const [a, b, c] = paneLeaves(layout.root).map((pane) => pane.id) as [
      string,
      string,
      string,
    ];
    expect(tabsOf(movePane(layout, a, 1))).toEqual([['b'], ['a'], ['c']]);
    expect(tabsOf(movePane(layout, c, -1))).toEqual([['a'], ['c'], ['b']]);
    expect(movePane(layout, a, -1)).toBe(layout);
    expect(tabsOf(swapPanes(layout, a, c))).toEqual([['c'], ['b'], ['a']]);
    expect(swapPanes(layout, a, a)).toBe(layout);
    expect(swapPanes(layout, a, 'missing')).toBe(layout);
    expect(b).toBeTruthy();
  });

  it('reorders tabs within a pane and activates one', () => {
    const stacked = open(EMPTY_LAYOUT, 'a', 'b', 'c', 'd', 'e');
    expect(tabsOf(moveTab(stacked, 'e', -1))[2]).toEqual(['c', 'e', 'd']);
    expect(moveTab(stacked, 'c', -1)).toBe(stacked);
    const pane = paneOfActivity(stacked, 'c');
    const picked = activateTab(stacked, pane?.id ?? '', 'c');
    expect(focusedActivity(picked)).toBe('c');
    expect(activateTab(stacked, pane?.id ?? '', 'a')).toBe(stacked);
  });
});

describe('resizing', () => {
  const layout = open(EMPTY_LAYOUT, 'a', 'b', 'c');
  const boundary = layoutGeometry(layout).boundaries[0];

  it('moves a boundary and keeps the two sides summing to their pair', () => {
    const next = resizeBoundary(layout, boundary?.splitId ?? '', 0, 70);
    const root = next.root;
    expect(root?.kind === 'split' && root.sizes).toEqual([70, 30]);
  });

  it('never lets either side shrink below the minimum share', () => {
    const left = resizeBoundary(layout, boundary?.splitId ?? '', 0, 1);
    const right = resizeBoundary(layout, boundary?.splitId ?? '', 0, 99);
    expect(left.root?.kind === 'split' && left.root.sizes).toEqual([15, 85]);
    expect(right.root?.kind === 'split' && right.root.sizes).toEqual([85, 15]);
  });

  it('shares a boundary equally on reset', () => {
    const moved = resizeBoundary(layout, boundary?.splitId ?? '', 0, 80);
    const reset = resetBoundary(moved, boundary?.splitId ?? '', 0);
    expect(reset.root?.kind === 'split' && reset.root.sizes).toEqual([50, 50]);
  });
});

describe('fitting to the viewport', () => {
  const layout = open(EMPTY_LAYOUT, 'a', 'b', 'c');

  it('folds panes beyond the limit into the pane before, keeping every activity', () => {
    const tablet = fitLayout(layout, MAX_PANES.tablet);
    expect(tabsOf(tablet)).toEqual([['a'], ['b', 'c']]);
    const phone = fitLayout(layout, MAX_PANES.phone);
    expect(tabsOf(phone)).toEqual([['a', 'b', 'c']]);
    expect(openActivities(phone)).toEqual(['a', 'b', 'c']);
    expect(fitLayout(layout, MAX_PANES.desktop)).toBe(layout);
  });

  it('keeps the focused activity on screen when its pane is folded away', () => {
    const phone = fitLayout(layout, MAX_PANES.phone);
    expect(focusedActivity(phone)).toBe('c');
    expect(phone.focusedPaneId).toBe(phone.root?.id);
  });
});

describe('pruning to what is available', () => {
  it('drops unavailable activities without disturbing the rest', () => {
    const layout = open(EMPTY_LAYOUT, 'a', 'b', 'c');
    const pruned = pruneLayout(layout, (id) => id !== 'b');
    expect(tabsOf(pruned)).toEqual([['a'], ['c']]);
    expect(pruneLayout(layout, () => true)).toBe(layout);
    expect(
      isActivityOpen(
        pruneLayout(layout, () => false),
        'a'
      )
    ).toBe(false);
  });
});
