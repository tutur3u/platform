import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState } from '@excalidraw/excalidraw/types';
import type { Json } from '@tuturuuu/types';

export interface WhiteboardSnapshot {
  elements?: ExcalidrawElement[];
  appState?: Partial<AppState>;
}

export function parseStoredWhiteboardSnapshot(
  snapshot: Json | string | null | undefined
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
  snapshot: Json | string | null | undefined,
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
