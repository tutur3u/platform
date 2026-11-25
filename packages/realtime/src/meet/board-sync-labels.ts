import type { BoardChange, BoardElement } from './board-sync-schema';

type Bound = { id?: unknown; type?: unknown } | null;

/** A live text element that names `arrowId` as its container. */
function isLabelOf(element: BoardElement | undefined, arrowId: string) {
  return (
    element?.type === 'text' &&
    element.isDeleted !== true &&
    (element as { containerId?: unknown }).containerId === arrowId
  );
}

/**
 * A guest's batch with every arrow's text labels checked against the scene
 * and the batch itself: a `text` entry in an arrow's `boundElements` stays
 * only when it names a live text element whose `containerId` is that arrow.
 * Excalidraw gives a labelled arrow an uncapped label canvas once the entry
 * names any element, the arrow itself included, so an unchecked entry would
 * let one long arrow take gigabytes on every viewer.
 */
export function checkArrowLabels(
  changes: readonly BoardChange[],
  scene: ReadonlyMap<string, BoardElement>
): BoardChange[] {
  const batch = new Map(
    changes.map((change) => [change.element.id, change.element])
  );
  return changes.map((change) => {
    const { element } = change;
    const bound = (element as { boundElements?: unknown }).boundElements;
    if (element.type !== 'arrow' || !Array.isArray(bound)) return change;
    const kept = (bound as Bound[]).filter((entry) => {
      if (entry?.type !== 'text') return true;
      const id = typeof entry.id === 'string' ? entry.id : '';
      return isLabelOf(batch.get(id) ?? scene.get(id), element.id);
    });
    if (kept.length === bound.length) return change;
    return { ...change, element: { ...element, boundElements: kept } };
  });
}
