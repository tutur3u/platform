import {
  type Axis,
  EMPTY_LAYOUT,
  type LayoutNode,
  MAX_PANES,
  paneLeaves,
  type StageLayout,
} from './layout-model';

export type VideoStripPreference = 'auto' | 'row' | 'pill';

export interface StoredStage {
  layout: StageLayout;
  strip: VideoStripPreference;
}

const VERSION = 1;
const MAX_DEPTH = 4;
const MAX_TABS = 24;

/** One key per person and room: a layout is private and local. */
export const stageLayoutKey = (accountId: string, meetingId: string) =>
  `meet:stage-layout:v${VERSION}:${accountId}:${meetingId}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseNode(
  raw: unknown,
  seenIds: Set<string>,
  seenTabs: Set<string>,
  depth: number
): LayoutNode | null {
  if (!isRecord(raw) || depth > MAX_DEPTH) return null;
  const id = raw.id;
  if (typeof id !== 'string' || !id || seenIds.has(id)) return null;
  seenIds.add(id);
  if (raw.kind === 'pane') {
    if (!Array.isArray(raw.tabs)) return null;
    const tabs: string[] = [];
    for (const tab of raw.tabs) {
      if (typeof tab !== 'string' || !tab || seenTabs.has(tab)) continue;
      if (seenTabs.size >= MAX_TABS) break;
      seenTabs.add(tab);
      tabs.push(tab);
    }
    if (!tabs.length) return null;
    const active =
      typeof raw.active === 'string' && tabs.includes(raw.active)
        ? raw.active
        : (tabs[0] as string);
    return { kind: 'pane', id, tabs, active };
  }
  if (
    raw.kind !== 'split' ||
    (raw.axis !== 'row' && raw.axis !== 'column') ||
    !Array.isArray(raw.children) ||
    !Array.isArray(raw.sizes) ||
    raw.children.length < 2 ||
    raw.children.length !== raw.sizes.length
  )
    return null;
  const sizes = raw.sizes as unknown[];
  if (sizes.some((size) => typeof size !== 'number' || !(size > 0)))
    return null;
  const children = raw.children.map((child) =>
    parseNode(child, seenIds, seenTabs, depth + 1)
  );
  if (children.some((child) => !child)) return null;
  return {
    kind: 'split',
    id,
    axis: raw.axis as Axis,
    children: children as LayoutNode[],
    sizes: sizes as number[],
  };
}

/** Rebuilds a layout from untrusted JSON; anything malformed yields none. */
export function parseStageLayout(raw: unknown): StageLayout {
  if (!isRecord(raw) || !isRecord(raw.layout)) return EMPTY_LAYOUT;
  const layout = raw.layout;
  const root = layout.root
    ? parseNode(layout.root, new Set(), new Set(), 0)
    : null;
  const leaves = paneLeaves(root);
  if (!root || leaves.length > MAX_PANES.desktop) return EMPTY_LAYOUT;
  const has = (id: unknown) => leaves.some((pane) => pane.id === id);
  const numbers = JSON.stringify(root).match(/"[ps](\d+)"/g) ?? [];
  const highest = Math.max(
    0,
    ...numbers.map((entry) => Number(entry.replace(/\D/g, '')))
  );
  return {
    root,
    focusedPaneId: has(layout.focusedPaneId)
      ? (layout.focusedPaneId as string)
      : (leaves[0]?.id ?? null),
    maximizedPaneId: has(layout.maximizedPaneId)
      ? (layout.maximizedPaneId as string)
      : null,
    nextId: Math.max(
      highest + 1,
      typeof layout.nextId === 'number' && Number.isFinite(layout.nextId)
        ? Math.floor(layout.nextId)
        : 1
    ),
  };
}

const preference = (value: unknown): VideoStripPreference =>
  value === 'row' || value === 'pill' ? value : 'auto';

export function readStoredStage(key: string): StoredStage {
  try {
    const text = window.localStorage.getItem(key);
    if (!text) return { layout: EMPTY_LAYOUT, strip: 'auto' };
    const raw: unknown = JSON.parse(text);
    return {
      layout: parseStageLayout(raw),
      strip: preference(isRecord(raw) ? raw.strip : undefined),
    };
  } catch {
    // The room stays usable when storage is disabled or the value is damaged.
    return { layout: EMPTY_LAYOUT, strip: 'auto' };
  }
}

export function writeStoredStage(key: string, stored: StoredStage) {
  try {
    if (!stored.layout.root && stored.strip === 'auto')
      window.localStorage.removeItem(key);
    else
      window.localStorage.setItem(
        key,
        JSON.stringify({ v: VERSION, ...stored })
      );
  } catch {
    // Keep the layout in memory for this visit.
  }
}
