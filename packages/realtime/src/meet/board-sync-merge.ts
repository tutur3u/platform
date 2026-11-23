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
      scene.set(element.id, element);
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
export function pruneTombstones(scene: BoardScene) {
  const limit = Math.floor(BOARD_LIMITS.maxElements * 0.9);
  if (scene.size <= limit) return 0;
  let removed = 0;
  for (const [id, element] of scene) {
    if (scene.size <= limit) break;
    if (element.isDeleted) {
      scene.delete(id);
      removed++;
    }
  }
  return removed;
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
