import type { BoardChange } from './board-sync-schema';

/**
 * A guest's batch with every `text` entry removed from each arrow's
 * `boundElements`, so no guest arrow carries a label. Excalidraw gives a
 * labelled arrow a square label canvas of its longest side that it never
 * caps, at any zoom, so a guest arrow is stored and relayed unlabelled.
 */
export function stripArrowLabels(changes: readonly BoardChange[]) {
  return changes.map((change) => {
    const { element } = change;
    const bound = (element as { boundElements?: unknown }).boundElements;
    if (element.type !== 'arrow' || !Array.isArray(bound)) return change;
    const kept = bound.filter(
      (entry) => (entry as { type?: unknown } | null)?.type !== 'text'
    );
    if (kept.length === bound.length) return change;
    return { ...change, element: { ...element, boundElements: kept } };
  });
}
