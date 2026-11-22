/**
 * The room stage's pane tree, as pure data. A layout is a tree of splits whose
 * leaves are panes; a pane stacks any number of activities as tabs. Every
 * operation returns a new layout and never touches React, the DOM or storage.
 */

export type Axis = 'row' | 'column';

export interface PaneNode {
  kind: 'pane';
  id: string;
  tabs: string[];
  active: string;
}

export interface SplitNode {
  kind: 'split';
  id: string;
  axis: Axis;
  children: LayoutNode[];
  /** Percent of the split's extent per child; always sums to 100. */
  sizes: number[];
}

export type LayoutNode = PaneNode | SplitNode;

export interface StageLayout {
  root: LayoutNode | null;
  focusedPaneId: string | null;
  maximizedPaneId: string | null;
  nextId: number;
}

export type ViewportTier = 'phone' | 'tablet' | 'desktop';

/** Visible panes per viewport: one on phones, two on tablets, three beyond. */
export const MAX_PANES: Record<ViewportTier, number> = {
  phone: 1,
  tablet: 2,
  desktop: 3,
};

/** The least share, in percent of a split, that either side of a boundary keeps. */
export const MIN_SHARE = 15;

export const EMPTY_LAYOUT: StageLayout = {
  root: null,
  focusedPaneId: null,
  maximizedPaneId: null,
  nextId: 1,
};

export function paneLeaves(node: LayoutNode | null): PaneNode[] {
  if (!node) return [];
  if (node.kind === 'pane') return [node];
  return node.children.flatMap(paneLeaves);
}

export const countPanes = (layout: StageLayout) =>
  paneLeaves(layout.root).length;

/** Open activities in pane order, then tab order. */
export function openActivities(layout: StageLayout) {
  return paneLeaves(layout.root).flatMap((pane) => pane.tabs);
}

export const findPane = (layout: StageLayout, paneId: string | null) =>
  paneLeaves(layout.root).find((pane) => pane.id === paneId) ?? null;

export const paneOfActivity = (layout: StageLayout, activityId: string) =>
  paneLeaves(layout.root).find((pane) => pane.tabs.includes(activityId)) ??
  null;

export const isActivityOpen = (layout: StageLayout, activityId: string) =>
  !!paneOfActivity(layout, activityId);

/** The activity a person is working in: the active tab of the focused pane. */
export function focusedActivity(layout: StageLayout) {
  return findPane(layout, layout.focusedPaneId)?.active ?? null;
}

const round = (value: number) => Math.round(value * 100) / 100;

function mapPanes(
  node: LayoutNode,
  fn: (pane: PaneNode) => PaneNode | null
): LayoutNode | null {
  if (node.kind === 'pane') return fn(node);
  const kept: { child: LayoutNode; size: number }[] = [];
  node.children.forEach((child, index) => {
    const next = mapPanes(child, fn);
    if (next) kept.push({ child: next, size: node.sizes[index] ?? 0 });
  });
  return normalize({
    ...node,
    children: kept.map((entry) => entry.child),
    sizes: kept.map((entry) => entry.size),
  });
}

/**
 * Drops empty splits, hands a lone child's slot to it, merges a child split
 * that runs the same way as its parent, and renormalizes sizes to 100.
 */
function normalize(node: SplitNode): LayoutNode | null {
  if (!node.children.length) return null;
  if (node.children.length === 1) return node.children[0] ?? null;
  const children: LayoutNode[] = [];
  const sizes: number[] = [];
  const total = node.sizes.reduce((sum, size) => sum + size, 0) || 1;
  node.children.forEach((child, index) => {
    const share = ((node.sizes[index] ?? 0) / total) * 100;
    if (child.kind === 'split' && child.axis === node.axis) {
      child.children.forEach((inner, innerIndex) => {
        children.push(inner);
        sizes.push(((child.sizes[innerIndex] ?? 0) / 100) * share);
      });
    } else {
      children.push(child);
      sizes.push(share);
    }
  });
  const rounded = sizes.map(round);
  const drift = round(100 - rounded.reduce((sum, size) => sum + size, 0));
  rounded[rounded.length - 1] = round(
    (rounded[rounded.length - 1] ?? 0) + drift
  );
  return { ...node, children, sizes: rounded };
}

function withRoot(layout: StageLayout, root: LayoutNode | null): StageLayout {
  const leaves = paneLeaves(root);
  const has = (id: string | null) => leaves.some((pane) => pane.id === id);
  return {
    ...layout,
    root,
    focusedPaneId: has(layout.focusedPaneId)
      ? layout.focusedPaneId
      : (leaves[0]?.id ?? null),
    maximizedPaneId: has(layout.maximizedPaneId)
      ? layout.maximizedPaneId
      : null,
  };
}

function replaceNode(
  node: LayoutNode,
  targetId: string,
  replacement: LayoutNode
): LayoutNode {
  if (node.id === targetId) return replacement;
  if (node.kind === 'pane') return node;
  return {
    ...node,
    children: node.children.map((child) =>
      replaceNode(child, targetId, replacement)
    ),
  };
}

function parentOf(node: LayoutNode, targetId: string): SplitNode | null {
  if (node.kind === 'pane') return null;
  if (node.children.some((child) => child.id === targetId)) return node;
  for (const child of node.children) {
    const found = parentOf(child, targetId);
    if (found) return found;
  }
  return null;
}

export interface OpenOptions {
  maxPanes: number;
  /** `tab` stacks into the focused pane even when there is room to split. */
  placement?: 'auto' | 'tab';
}

/**
 * Opens an activity. One already open is focused where it lives (and keeps a
 * maximized view on its pane); a new one splits the focused pane while there
 * is room for another pane and stacks as a tab otherwise.
 */
export function openActivity(
  layout: StageLayout,
  activityId: string,
  { maxPanes, placement = 'auto' }: OpenOptions
): StageLayout {
  const existing = paneOfActivity(layout, activityId);
  if (existing) {
    return {
      ...withRoot(
        layout,
        mapPanes(layout.root as LayoutNode, (pane) =>
          pane.id === existing.id ? { ...pane, active: activityId } : pane
        )
      ),
      focusedPaneId: existing.id,
      maximizedPaneId: layout.maximizedPaneId ? existing.id : null,
    };
  }
  const seq = layout.nextId;
  const fresh: PaneNode = {
    kind: 'pane',
    id: `p${seq}`,
    tabs: [activityId],
    active: activityId,
  };
  const next = { ...layout, nextId: seq + 1, maximizedPaneId: null };
  if (!layout.root) return { ...next, root: fresh, focusedPaneId: fresh.id };
  const focused =
    findPane(layout, layout.focusedPaneId) ?? paneLeaves(layout.root)[0];
  if (!focused) return { ...next, root: fresh, focusedPaneId: fresh.id };
  if (placement === 'tab' || countPanes(layout) >= Math.max(1, maxPanes)) {
    const stacked = mapPanes(layout.root, (pane) =>
      pane.id === focused.id
        ? { ...pane, tabs: [...pane.tabs, activityId], active: activityId }
        : pane
    );
    return withRoot({ ...next, focusedPaneId: focused.id }, stacked);
  }
  const parent = parentOf(layout.root, focused.id);
  const axis: Axis = parent?.axis === 'row' ? 'column' : 'row';
  const split: SplitNode = {
    kind: 'split',
    id: `s${seq}`,
    axis,
    children: [focused, fresh],
    sizes: [50, 50],
  };
  const root = normalize(
    replaceNode(layout.root, focused.id, split) as SplitNode
  );
  return withRoot({ ...next, focusedPaneId: fresh.id }, root);
}

/** Closes one activity; its pane goes with its last tab. */
export function closeActivity(
  layout: StageLayout,
  activityId: string
): StageLayout {
  const pane = paneOfActivity(layout, activityId);
  if (!pane || !layout.root) return layout;
  const order = paneLeaves(layout.root);
  const index = order.findIndex((leaf) => leaf.id === pane.id);
  const tabIndex = pane.tabs.indexOf(activityId);
  const tabs = pane.tabs.filter((id) => id !== activityId);
  const root = mapPanes(layout.root, (leaf) =>
    leaf.id !== pane.id
      ? leaf
      : tabs.length
        ? {
            ...leaf,
            tabs,
            active:
              leaf.active === activityId
                ? (tabs[Math.min(tabIndex, tabs.length - 1)] ?? tabs[0] ?? '')
                : leaf.active,
          }
        : null
  );
  const neighbour = tabs.length ? pane : (order[index + 1] ?? order[index - 1]);
  const focusedGone = layout.focusedPaneId === pane.id && !tabs.length;
  return withRoot(
    {
      ...layout,
      focusedPaneId: focusedGone
        ? (neighbour?.id ?? null)
        : layout.focusedPaneId,
    },
    root
  );
}

export function activateTab(
  layout: StageLayout,
  paneId: string,
  activityId: string
): StageLayout {
  const pane = findPane(layout, paneId);
  if (!pane || !pane.tabs.includes(activityId) || !layout.root) return layout;
  return {
    ...layout,
    root: mapPanes(layout.root, (leaf) =>
      leaf.id === paneId ? { ...leaf, active: activityId } : leaf
    ),
    focusedPaneId: paneId,
  };
}

export function focusPane(layout: StageLayout, paneId: string): StageLayout {
  if (!findPane(layout, paneId) || layout.focusedPaneId === paneId)
    return layout;
  return { ...layout, focusedPaneId: paneId };
}

export function maximizePane(
  layout: StageLayout,
  paneId: string | null
): StageLayout {
  if (paneId && !findPane(layout, paneId)) return layout;
  return {
    ...layout,
    maximizedPaneId: paneId,
    focusedPaneId: paneId ?? layout.focusedPaneId,
  };
}

/** Where a boundary sits within its split, and how far it may move. */
export function boundaryRange(sizes: readonly number[], index: number) {
  const before = sizes.slice(0, index).reduce((sum, size) => sum + size, 0);
  const pair = (sizes[index] ?? 0) + (sizes[index + 1] ?? 0);
  return {
    now: round(before + (sizes[index] ?? 0)),
    min: round(before + Math.min(MIN_SHARE, pair / 2)),
    max: round(before + pair - Math.min(MIN_SHARE, pair / 2)),
    pair,
    before,
  };
}

function updateSplit(
  node: LayoutNode,
  splitId: string,
  fn: (split: SplitNode) => SplitNode
): LayoutNode {
  if (node.kind === 'pane') return node;
  if (node.id === splitId) return fn(node);
  return {
    ...node,
    children: node.children.map((child) => updateSplit(child, splitId, fn)),
  };
}

/** Moves boundary `index` (between child `index` and the next) to `position` percent. */
export function resizeBoundary(
  layout: StageLayout,
  splitId: string,
  index: number,
  position: number
): StageLayout {
  if (!layout.root) return layout;
  return {
    ...layout,
    root: updateSplit(layout.root, splitId, (split) => {
      if (index < 0 || index >= split.sizes.length - 1) return split;
      const range = boundaryRange(split.sizes, index);
      const target = Math.min(range.max, Math.max(range.min, position));
      const sizes = [...split.sizes];
      sizes[index] = round(target - range.before);
      sizes[index + 1] = round(range.pair - sizes[index]);
      return { ...split, sizes };
    }),
  };
}

/** Shares the two panes beside a boundary equally. */
export function resetBoundary(
  layout: StageLayout,
  splitId: string,
  index: number
): StageLayout {
  if (!layout.root) return layout;
  return {
    ...layout,
    root: updateSplit(layout.root, splitId, (split) => {
      if (index < 0 || index >= split.sizes.length - 1) return split;
      const range = boundaryRange(split.sizes, index);
      return resizeBoundary(
        { ...layout, root: split },
        split.id,
        index,
        range.before + range.pair / 2
      ).root as SplitNode;
    }),
  };
}

/** Exchanges two panes' places, each keeping its own tabs. */
export function swapPanes(
  layout: StageLayout,
  firstId: string,
  secondId: string
): StageLayout {
  const first = findPane(layout, firstId);
  const second = findPane(layout, secondId);
  if (!first || !second || first.id === second.id || !layout.root)
    return layout;
  const swap = (node: LayoutNode): LayoutNode => {
    if (node.kind === 'pane')
      return node.id === first.id
        ? second
        : node.id === second.id
          ? first
          : node;
    return { ...node, children: node.children.map(swap) };
  };
  return { ...layout, root: swap(layout.root) };
}

/** Moves a pane one place earlier (-1) or later (1) in reading order. */
export function movePane(
  layout: StageLayout,
  paneId: string,
  step: -1 | 1
): StageLayout {
  const order = paneLeaves(layout.root);
  const index = order.findIndex((pane) => pane.id === paneId);
  const target = order[index + step];
  if (index < 0 || !target) return layout;
  return swapPanes(layout, paneId, target.id);
}

/** Moves a tab one place earlier (-1) or later (1) within its pane. */
export function moveTab(
  layout: StageLayout,
  activityId: string,
  step: -1 | 1
): StageLayout {
  const pane = paneOfActivity(layout, activityId);
  if (!pane || !layout.root) return layout;
  const index = pane.tabs.indexOf(activityId);
  const target = index + step;
  if (target < 0 || target >= pane.tabs.length) return layout;
  const tabs = [...pane.tabs];
  [tabs[index], tabs[target]] = [tabs[target] as string, tabs[index] as string];
  return {
    ...layout,
    root: mapPanes(layout.root, (leaf) =>
      leaf.id === pane.id ? { ...leaf, tabs } : leaf
    ),
  };
}

/**
 * The layout a viewport can show: panes beyond `maxPanes` fold their tabs
 * into the pane before them, so narrowing a window never loses an activity.
 */
export function fitLayout(layout: StageLayout, maxPanes: number): StageLayout {
  let fitted = layout;
  const limit = Math.max(1, maxPanes);
  while (countPanes(fitted) > limit && fitted.root) {
    const order = paneLeaves(fitted.root);
    const last = order[order.length - 1] as PaneNode;
    const into = order[order.length - 2] as PaneNode;
    const focusedLast = fitted.focusedPaneId === last.id;
    const root = mapPanes(fitted.root, (pane) => {
      if (pane.id === last.id) return null;
      if (pane.id !== into.id) return pane;
      return {
        ...pane,
        tabs: [...pane.tabs, ...last.tabs],
        active: focusedLast ? last.active : pane.active,
      };
    });
    fitted = withRoot(
      {
        ...fitted,
        focusedPaneId: focusedLast ? into.id : fitted.focusedPaneId,
      },
      root
    );
  }
  return fitted;
}

/** Keeps only activities `isAvailable` accepts. */
export function pruneLayout(
  layout: StageLayout,
  isAvailable: (activityId: string) => boolean
): StageLayout {
  return openActivities(layout)
    .filter((id) => !isAvailable(id))
    .reduce(closeActivity, layout);
}

/**
 * Makes a view hold the same activities as `source`: ones `source` no longer
 * has are closed, ones it gained stack into the focused pane.
 */
export function alignLayout(
  layout: StageLayout,
  source: StageLayout
): StageLayout {
  const wanted = openActivities(source);
  const kept = openActivities(layout).filter((id) => !wanted.includes(id));
  const trimmed = kept.reduce(closeActivity, layout);
  return wanted
    .filter((id) => !isActivityOpen(trimmed, id))
    .reduce(
      (next, id) =>
        openActivity(next, id, {
          maxPanes: Number.MAX_SAFE_INTEGER,
          placement: 'tab',
        }),
      trimmed
    );
}
