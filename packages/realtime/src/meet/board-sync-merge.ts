import {
  elementCanvasArea,
  elementChurnCost,
  elementRenderCost,
} from './board-sync-cost';
import { stripArrowLabels } from './board-sync-labels';
import {
  BOARD_LIMITS,
  type BoardChange,
  type BoardElement,
  byteLength,
} from './board-sync-schema';

/** Whether `candidate` supersedes `existing`: higher version, then lower nonce. */
export function supersedes(candidate: BoardElement, existing: BoardElement) {
  return (
    candidate.version > existing.version ||
    (candidate.version === existing.version &&
      candidate.versionNonce < existing.versionNonce)
  );
}

export type BoardScene = Map<string, BoardElement>;

/**
 * What the room keeps of a deleted element: its identity and version, which is
 * all a stale peer's copy needs to lose against, without the content, so
 * deleting something frees space.
 */
export function stripTombstone(element: BoardElement): BoardElement {
  if (!element.isDeleted) return element;
  const { id, type, version, versionNonce, updated } =
    element as BoardElement & {
      updated?: number;
    };
  return {
    id,
    type,
    version,
    versionNonce,
    isDeleted: true,
    ...(updated === undefined ? {} : { updated }),
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    angle: 0,
    ...('points' in element ? { points: [] } : {}),
  } as BoardElement;
}

export function sceneFrom(elements: readonly BoardElement[]): BoardScene {
  const scene: BoardScene = new Map();
  mergeElements(scene, elements);
  return scene;
}

/** Merges elements into the scene; returns the ones that changed it. Idempotent. */
export function mergeElements(
  scene: BoardScene,
  elements: readonly BoardElement[]
): BoardElement[] {
  const applied: BoardElement[] = [];
  for (const element of elements) {
    const existing = scene.get(element.id);
    if (!existing || supersedes(element, existing)) {
      scene.set(element.id, stripTombstone(element));
      applied.push(element);
    }
  }
  return applied;
}

/**
 * Applies a client batch. New elements past the element budget are dropped so
 * a participant cannot grow the board without bound; updates and deletions of
 * known elements always apply.
 */
export function applyBoardChanges(
  scene: BoardScene,
  changes: readonly BoardChange[]
): BoardChange[] {
  const applied: BoardChange[] = [];
  for (const change of changes) {
    const existing = scene.get(change.element.id);
    if (!existing && scene.size >= BOARD_LIMITS.maxElements) continue;
    if (!existing || supersedes(change.element, existing)) {
      scene.set(change.element.id, change.element);
      applied.push(change);
    }
  }
  return applied;
}

/**
 * Running byte size, render cost (`elementRenderCost`) and cached canvas
 * pixels (`elementCanvasArea`) of each element, so a batch is checked without
 * re-measuring the scene.
 */
export interface SceneSizes {
  sizes: Map<string, number>;
  total: number;
  costs: Map<string, number>;
  costTotal: number;
  areas: Map<string, number>;
  areaTotal: number;
}

export function sizesFrom(scene: BoardScene): SceneSizes {
  const sizes = new Map<string, number>();
  const costs = new Map<string, number>();
  const areas = new Map<string, number>();
  let total = 0;
  let costTotal = 0;
  let areaTotal = 0;
  for (const [id, element] of scene) {
    const bytes = byteLength(element);
    sizes.set(id, bytes);
    total += bytes;
    const cost = elementRenderCost(element);
    costs.set(id, cost);
    costTotal += cost;
    const area = elementCanvasArea(element);
    areas.set(id, area);
    areaTotal += area;
  }
  return { sizes, total, costs, costTotal, areas, areaTotal };
}

/** Limits a guest write is held to; members' writes pass none. */
export interface GuestWriteLimits {
  /** Render cost the scene may hold before growth is refused. */
  maxCost?: number;
  /** Cached canvas pixels the scene may hold before growth is refused. */
  maxArea?: number;
  /**
   * Churn this write may still apply (`elementChurnCost`); each applied
   * change spends it.
   */
  budget?: { tokens: number };
  /** Drop every text label from arrows (`stripArrowLabels`). */
  stripLabels?: boolean;
}

export interface BoundedResult {
  applied: BoardChange[];
  /** Changes refused because the scene would pass its element or byte budget. */
  rejected: 'size' | 'count' | null;
}

/**
 * Applies a client batch within the element and byte budgets and, for guest
 * writes, the scene's render cost and canvas area budgets (which count every
 * element in the scene) and the writer's churn budget. Growth that would pass
 * a scene budget is refused; changes that keep or shrink an element pass them,
 * so a full board can still be cleaned up. The churn budget charges every
 * applied change its render cost and canvas area, so only deletions (which
 * cost nothing) apply once it is spent. With `stripLabels`, arrow labels are
 * dropped first, and the relayed change carries the element as stored.
 */
export function applyBoundedChanges(
  scene: BoardScene,
  tracker: SceneSizes,
  changes: readonly BoardChange[],
  maxBytes: number = BOARD_LIMITS.maxSnapshotBytes,
  {
    maxCost = Number.POSITIVE_INFINITY,
    maxArea = Number.POSITIVE_INFINITY,
    budget,
    stripLabels = false,
  }: GuestWriteLimits = {}
): BoundedResult {
  const applied: BoardChange[] = [];
  let rejected: BoundedResult['rejected'] = null;
  const checked = stripLabels ? stripArrowLabels(changes) : changes;
  for (const change of checked) {
    const { element } = change;
    const existing = scene.get(element.id);
    if (existing && !supersedes(element, existing)) continue;
    if (!existing && scene.size >= BOARD_LIMITS.maxElements) {
      rejected = 'count';
      continue;
    }
    const held = stripTombstone(element);
    const before = tracker.sizes.get(element.id) ?? 0;
    const bytes = byteLength(held);
    if (bytes > before && tracker.total - before + bytes > maxBytes) {
      rejected ??= 'size';
      continue;
    }
    const costBefore = tracker.costs.get(element.id) ?? 0;
    const cost = elementRenderCost(held);
    const nextCost = tracker.costTotal - costBefore + cost;
    // Written as `!(… <= …)` so a non-finite total refuses instead of passing.
    if (cost > costBefore && !(nextCost <= maxCost)) {
      rejected ??= 'size';
      continue;
    }
    const areaBefore = tracker.areas.get(element.id) ?? 0;
    const area = elementCanvasArea(held);
    const nextArea = tracker.areaTotal - areaBefore + area;
    if (area > areaBefore && !(nextArea <= maxArea)) {
      rejected ??= 'size';
      continue;
    }
    const churn = budget ? elementChurnCost(held) : 0;
    if (budget && !(churn <= budget.tokens)) {
      rejected ??= 'size';
      continue;
    }
    scene.set(element.id, held);
    tracker.sizes.set(element.id, bytes);
    tracker.total += bytes - before;
    tracker.costs.set(element.id, cost);
    tracker.costTotal = nextCost;
    tracker.areas.set(element.id, area);
    tracker.areaTotal = nextArea;
    if (budget) budget.tokens -= churn;
    applied.push(change);
  }
  return { applied, rejected };
}

export function sceneElements(scene: BoardScene): BoardElement[] {
  return [...scene.values()];
}

export function sceneBytes(scene: BoardScene) {
  return byteLength(sceneElements(scene));
}

/**
 * Drops the oldest deleted elements once the scene nears its budget. Deleted
 * elements only matter while a stale peer could resurrect them.
 */
export function pruneTombstones(scene: BoardScene, tracker?: SceneSizes) {
  const limit = Math.floor(BOARD_LIMITS.maxElements * 0.9);
  if (scene.size <= limit) return 0;
  let removed = 0;
  for (const [id, element] of scene) {
    if (scene.size <= limit) break;
    if (element.isDeleted) {
      scene.delete(id);
      if (tracker) {
        tracker.total -= tracker.sizes.get(id) ?? 0;
        tracker.sizes.delete(id);
        tracker.costTotal -= tracker.costs.get(id) ?? 0;
        tracker.costs.delete(id);
        tracker.areaTotal -= tracker.areas.get(id) ?? 0;
        tracker.areas.delete(id);
      }
      removed++;
    }
  }
  return removed;
}

/** Marks an element deleted with a version above any peer's copy of it. */
export function tombstone(element: BoardElement): BoardElement {
  return stripTombstone({
    ...element,
    isDeleted: true,
    version: element.version + 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
  });
}

/** Splits a scene into messages that each stay under `maxBytes` of element JSON. */
export function chunkElements(
  elements: readonly BoardElement[],
  maxBytes: number = BOARD_LIMITS.chunkBytes
): BoardElement[][] {
  const chunks: BoardElement[][] = [];
  let current: BoardElement[] = [];
  let size = 0;
  for (const element of elements) {
    const bytes = byteLength(element) + 1;
    if (current.length > 0 && size + bytes > maxBytes) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(element);
    size += bytes;
  }
  if (current.length > 0 || chunks.length === 0) chunks.push(current);
  return chunks;
}

const byId = (elements: readonly BoardElement[]) =>
  [...elements].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** A JSON value with every object's keys in sorted order, recursively. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort())
    sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
  return sorted;
}

/**
 * Canonical JSON of a scene's content: elements by id and every object's keys
 * sorted, so equal scenes compare equal however their elements were built.
 * The room stores a guest's element in the guest schema's key order and a
 * member's in the board schema's; the platform re-parses both in the board
 * schema's order, so a comparison by key order would never match a guest's
 * element.
 */
export function canonicalScene(elements: readonly BoardElement[]) {
  return JSON.stringify(byId(elements).map(sortKeys));
}

/**
 * The text a flush's `hash` covers: the elements exactly as the flush body
 * carries them, by id. The platform checks it against the body's own JSON
 * before parsing, so it never depends on how a parser orders keys.
 */
export function flushDigestText(elements: readonly unknown[]) {
  return JSON.stringify(byId(elements as BoardElement[]));
}
