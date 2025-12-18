import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';

export interface ElementChange {
  element: ExcalidrawElement;
  type: 'insert' | 'update' | 'delete';
}

/**
 * Detects changes between two element arrays
 * Returns only the elements that have changed (added, updated, or deleted)
 */
export function detectElementChanges(
  previous: readonly ExcalidrawElement[],
  current: readonly ExcalidrawElement[]
): ElementChange[] {
  const changes: ElementChange[] = [];
  const previousMap = new Map(previous.map((el) => [el.id, el]));
  const currentMap = new Map(current.map((el) => [el.id, el]));

  // Detect inserts and updates
  for (const element of current) {
    const previousElement = previousMap.get(element.id);

    if (!previousElement) {
      // New element
      changes.push({ element, type: 'insert' });
    } else if (
      element.version !== previousElement.version ||
      element.versionNonce !== previousElement.versionNonce
    ) {
      // Updated element (version or versionNonce changed)
      changes.push({ element, type: 'update' });
    }
  }

  // Detect deletes (elements that were in previous but not in current, or marked as deleted)
  for (const element of previous) {
    const currentElement = currentMap.get(element.id);

    if (!currentElement) {
      // Element was removed entirely
      changes.push({
        element: { ...element, isDeleted: true } as ExcalidrawElement,
        type: 'delete',
      });
    } else if (!element.isDeleted && currentElement.isDeleted) {
      // Element was soft-deleted
      changes.push({ element: currentElement, type: 'delete' });
    }
  }

  return changes;
}

/**
 * Merges remote elements with local elements using Excalidraw's conflict resolution:
 * - Higher version wins
 * - If versions are equal, lower versionNonce wins (deterministic)
 */
export function mergeElements(
  localElements: ExcalidrawElement[],
  remoteElements: ExcalidrawElement[]
): ExcalidrawElement[] {
  const elementMap = new Map<string, ExcalidrawElement>();

  // Start with local elements
  for (const el of localElements) {
    elementMap.set(el.id, el);
  }

  // Merge remote elements
  for (const remoteEl of remoteElements) {
    const localEl = elementMap.get(remoteEl.id);

    if (!localEl) {
      // New element from remote - add it
      elementMap.set(remoteEl.id, remoteEl);
    } else if (remoteEl.version > localEl.version) {
      // Remote has newer version - use remote
      elementMap.set(remoteEl.id, remoteEl);
    } else if (remoteEl.version === localEl.version) {
      // Same version - use lower versionNonce (deterministic winner)
      if (remoteEl.versionNonce < localEl.versionNonce) {
        elementMap.set(remoteEl.id, remoteEl);
      }
    }
    // If local version > remote version, keep local (already in map)
  }

  return Array.from(elementMap.values());
}
