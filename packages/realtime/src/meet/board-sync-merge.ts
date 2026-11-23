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

/** Running byte size of each element, so a batch is checked without re-measuring the scene. */
export interface SceneSizes {
  sizes: Map<string, number>;
  total: number;
}

export function sizesFrom(scene: BoardScene): SceneSizes {
  const sizes = new Map<string, number>();
  let total = 0;
  for (const [id, element] of scene) {
    const bytes = byteLength(element);
    sizes.set(id, bytes);
    total += bytes;
  }
  return { sizes, total };
}

export interface BoundedResult {
  applied: BoardChange[];
  /** Changes refused because the scene would pass its element or byte budget. */
  rejected: 'size' | 'count' | null;
}

/**
 * Applies a client batch within the element and byte budgets. Growth that would
 * pass a budget is refused; changes that keep or shrink an element always apply,
 * so a full board can still be cleaned up.
 */
export function applyBoundedChanges(
  scene: BoardScene,
  tracker: SceneSizes,
  changes: readonly BoardChange[],
  maxBytes: number = BOARD_LIMITS.maxSnapshotBytes
): BoundedResult {
  const applied: BoardChange[] = [];
  let rejected: BoundedResult['rejected'] = null;
  for (const change of changes) {
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
    scene.set(element.id, held);
    tracker.sizes.set(element.id, bytes);
    tracker.total += bytes - before;
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

/** Canonical JSON of a scene: elements by id, so equal scenes hash equally. */
export function canonicalScene(elements: readonly BoardElement[]) {
  return JSON.stringify(
    [...elements]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((element) => element)
  );
}
