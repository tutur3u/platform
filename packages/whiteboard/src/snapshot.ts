import type { ExcalidrawElement, WhiteboardSnapshot } from './types';

export type { WhiteboardSnapshot };

export function parseStoredWhiteboardSnapshot(
  snapshot: unknown
): WhiteboardSnapshot | null {
  if (snapshot == null) {
    return null;
  }

  if (typeof snapshot === 'string') {
    try {
      return JSON.parse(snapshot) as WhiteboardSnapshot;
    } catch {
      return null;
    }
  }

  return snapshot as WhiteboardSnapshot;
}

export function isExcalidrawSnapshot(
  data: unknown
): data is WhiteboardSnapshot {
  return (
    !!data &&
    typeof data === 'object' &&
    'elements' in data &&
    Array.isArray((data as WhiteboardSnapshot).elements)
  );
}

export function extractWhiteboardImageFileIds(
  snapshot: unknown,
  expectedPrefix?: string
) {
  const parsed = parseStoredWhiteboardSnapshot(snapshot);
  if (!isExcalidrawSnapshot(parsed)) {
    return new Set<string>();
  }

  const imageFileIds = new Set<string>();

  for (const element of parsed.elements ?? []) {
    if (!element || typeof element !== 'object') {
      continue;
    }

    const candidate = element as {
      type?: unknown;
      fileId?: unknown;
    };

    if (candidate.type !== 'image' || typeof candidate.fileId !== 'string') {
      continue;
    }

    if (
      candidate.fileId.includes('..') ||
      (expectedPrefix && !candidate.fileId.startsWith(expectedPrefix))
    ) {
      continue;
    }

    imageFileIds.add(candidate.fileId);
  }

  return imageFileIds;
}

/** The part of a scene worth storing: elements plus a minimal app state. */
export function toStoredWhiteboardSnapshot(
  elements: readonly ExcalidrawElement[],
  appState: { viewBackgroundColor?: string; gridSize?: number | null }
): WhiteboardSnapshot {
  return {
    elements: elements as ExcalidrawElement[],
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor,
      gridSize: appState.gridSize,
    } as WhiteboardSnapshot['appState'],
  };
}
