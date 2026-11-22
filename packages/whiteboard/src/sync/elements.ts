import type { ElementChange, ExcalidrawElement } from '../types';

/**
 * Detects changes between two element arrays.
 * Returns only the elements that were added, updated or deleted.
 */
export function detectElementChanges(
  previous: readonly ExcalidrawElement[],
  current: readonly ExcalidrawElement[]
): ElementChange[] {
  const changes: ElementChange[] = [];
  const previousMap = new Map(previous.map((el) => [el.id, el]));
  const currentMap = new Map(current.map((el) => [el.id, el]));

  for (const element of current) {
    const previousElement = previousMap.get(element.id);

    if (!previousElement) {
      changes.push({ element, type: 'insert' });
    } else if (
      element.version !== previousElement.version ||
      element.versionNonce !== previousElement.versionNonce
    ) {
      changes.push({ element, type: 'update' });
    }
  }

  for (const element of previous) {
    const currentElement = currentMap.get(element.id);

    if (!currentElement) {
      changes.push({
        element: { ...element, isDeleted: true } as ExcalidrawElement,
        type: 'delete',
      });
    } else if (!element.isDeleted && currentElement.isDeleted) {
      changes.push({ element: currentElement, type: 'delete' });
    }
  }

  return changes;
}

/** Whether `candidate` supersedes `existing`: higher version, then higher nonce. */
function supersedesChange(
  candidate: ExcalidrawElement,
  existing: ExcalidrawElement
) {
  return (
    candidate.version > existing.version ||
    (candidate.version === existing.version &&
      candidate.versionNonce > existing.versionNonce)
  );
}

/**
 * Collapses a list of pending changes so only the newest change of each
 * element remains. Used to build an outgoing broadcast.
 */
export function dedupeElementChanges(
  changes: readonly ElementChange[]
): ElementChange[] {
  const byId = new Map<string, ElementChange>();

  for (const change of changes) {
    const existing = byId.get(change.element.id);

    if (!existing || supersedesChange(change.element, existing.element)) {
      byId.set(change.element.id, change);
    }
  }

  return Array.from(byId.values());
}

/**
 * Merges remote elements into the local scene:
 * - a higher version wins;
 * - on equal versions the lower versionNonce wins, so every peer converges on
 *   the same element regardless of the order updates arrive in.
 * Applying the same remote batch twice yields the same result.
 */
export function mergeElements(
  localElements: readonly ExcalidrawElement[],
  remoteElements: readonly ExcalidrawElement[]
): ExcalidrawElement[] {
  const elementMap = new Map<string, ExcalidrawElement>();

  for (const el of localElements) {
    elementMap.set(el.id, el);
  }

  for (const remoteEl of remoteElements) {
    const localEl = elementMap.get(remoteEl.id);

    if (!localEl) {
      elementMap.set(remoteEl.id, remoteEl);
    } else if (remoteEl.version > localEl.version) {
      elementMap.set(remoteEl.id, remoteEl);
    } else if (
      remoteEl.version === localEl.version &&
      remoteEl.versionNonce < localEl.versionNonce
    ) {
      elementMap.set(remoteEl.id, remoteEl);
    }
  }

  return Array.from(elementMap.values());
}
