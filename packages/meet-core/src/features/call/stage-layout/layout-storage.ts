import {
  alignLayout,
  type Axis,
  EMPTY_LAYOUT,
  type LayoutNode,
  MAX_PANES,
  MIN_SHARE,
  paneLeaves,
  type StageLayout,
} from './layout-model';

export type VideoStripPreference = 'auto' | 'row' | 'pill';

/** Layouts the person arranged on a narrower screen. */
export type NarrowViews = Partial<Record<'tablet' | 'phone', StageLayout>>;

export interface StoredStage {
  /** The desktop arrangement: the source of truth for what is open. */
  layout: StageLayout;
  /** Own arrangements for narrower screens, so editing there leaves `layout` be. */
  views: NarrowViews;
  strip: VideoStripPreference;
}

const VERSION = 1;
/** Rooms whose layouts are kept per browser; the least recently used go first. */
export const MAX_STORED_ROOMS = 30;
const INDEX_KEY = `meet:stage-layout:v${VERSION}:index`;
const MAX_DEPTH = 4;
const MAX_TABS = 24;

/** One key per person and room: a layout is private and local. */
export const stageLayoutKey = (accountId: string, meetingId: string) =>
  `meet:stage-layout:v${VERSION}:${accountId}:${meetingId}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Scales sizes to sum to 100. A pane that would fall below the least share is
 * a sign of a damaged value, so the split falls back to equal shares.
 */
export function normalizeSizes(sizes: readonly number[]) {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const equal = Math.round((100 / sizes.length) * 100) / 100;
  let shares = sizes.map((size) => Math.round((size / total) * 10_000) / 100);
  if (shares.some((share) => !(share >= MIN_SHARE)))
    shares = sizes.map(() => equal);
  const drift =
    Math.round((100 - shares.reduce((a, b) => a + b, 0)) * 100) / 100;
  shares[shares.length - 1] =
    Math.round(((shares[shares.length - 1] ?? 0) + drift) * 100) / 100;
  return shares;
}

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
  const given = raw.sizes as unknown[];
  if (given.some((size) => typeof size !== 'number' || !(size > 0)))
    return null;
  const sizes = normalizeSizes(given as number[]);
  const children = raw.children.map((child) =>
    parseNode(child, seenIds, seenTabs, depth + 1)
  );
  if (children.some((child) => !child)) return null;
  return {
    kind: 'split',
    id,
    axis: raw.axis as Axis,
    children: children as LayoutNode[],
    sizes,
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

function parseViews(raw: unknown, desktop: StageLayout): NarrowViews {
  if (!isRecord(raw)) return {};
  const views: NarrowViews = {};
  for (const tier of ['tablet', 'phone'] as const) {
    const parsed = parseStageLayout({ layout: raw[tier] });
    if (!parsed.root || paneLeaves(parsed.root).length > MAX_PANES[tier])
      continue;
    views[tier] = alignLayout(parsed, desktop);
  }
  return views;
}

const preference = (value: unknown): VideoStripPreference =>
  value === 'row' || value === 'pill' ? value : 'auto';

/** Notes that `key` was used now, and forgets the oldest layouts past the cap. */
function touchIndex(key: string, keep: boolean) {
  try {
    rewriteIndex(key, keep);
  } catch {
    // Housekeeping only; the layout itself is already read or written.
  }
}

function rewriteIndex(key: string, keep: boolean) {
  const raw: unknown = JSON.parse(
    window.localStorage.getItem(INDEX_KEY) ?? '[]'
  );
  const entries = (Array.isArray(raw) ? raw : []).filter(
    (entry): entry is { key: string; at: number } =>
      isRecord(entry) &&
      typeof entry.key === 'string' &&
      typeof entry.at === 'number' &&
      entry.key !== key
  );
  if (keep) entries.push({ key, at: Date.now() });
  entries.sort((a, b) => b.at - a.at);
  for (const old of entries.splice(MAX_STORED_ROOMS))
    window.localStorage.removeItem(old.key);
  window.localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
}

export function readStoredStage(key: string): StoredStage {
  try {
    const text = window.localStorage.getItem(key);
    if (!text) return { layout: EMPTY_LAYOUT, views: {}, strip: 'auto' };
    touchIndex(key, true);
    const raw: unknown = JSON.parse(text);
    const layout = parseStageLayout(raw);
    return {
      layout,
      views: parseViews(isRecord(raw) ? raw.views : undefined, layout),
      strip: preference(isRecord(raw) ? raw.strip : undefined),
    };
  } catch {
    // The room stays usable when storage is disabled or the value is damaged.
    return { layout: EMPTY_LAYOUT, views: {}, strip: 'auto' };
  }
}

export function writeStoredStage(key: string, stored: StoredStage) {
  try {
    const empty = !stored.layout.root && stored.strip === 'auto';
    if (empty) window.localStorage.removeItem(key);
    else
      window.localStorage.setItem(
        key,
        JSON.stringify({ v: VERSION, ...stored })
      );
    touchIndex(key, !empty);
  } catch {
    // Keep the layout in memory for this visit.
  }
}
