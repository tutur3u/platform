import type { AppState } from '@excalidraw/excalidraw/types';

export interface PersistedViewport {
  scrollX: number;
  scrollY: number;
  zoom: AppState['zoom'];
}

export function parsePersistedViewport(
  value: string | null
): PersistedViewport | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as {
      scrollX?: unknown;
      scrollY?: unknown;
      zoom?: unknown;
    };

    if (
      typeof parsed.scrollX !== 'number' ||
      typeof parsed.scrollY !== 'number' ||
      !Number.isFinite(parsed.scrollX) ||
      !Number.isFinite(parsed.scrollY)
    ) {
      return null;
    }

    if (typeof parsed.zoom === 'object' && parsed.zoom !== null) {
      const zoomValue = (parsed.zoom as { value?: unknown }).value;

      if (typeof zoomValue !== 'number' || !Number.isFinite(zoomValue)) {
        return null;
      }

      return {
        scrollX: parsed.scrollX,
        scrollY: parsed.scrollY,
        zoom: parsed.zoom as AppState['zoom'],
      };
    }

    return null;
  } catch {
    return null;
  }
}
