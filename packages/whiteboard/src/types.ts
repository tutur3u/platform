import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState } from '@excalidraw/excalidraw/types';

export type { ExcalidrawElement };

export type ElementChangeType = 'insert' | 'update' | 'delete';

export interface ElementChange {
  element: ExcalidrawElement;
  type: ElementChangeType;
}

export type SelectedElementIds = Readonly<Record<string, true>>;

/** Scene content handed to Excalidraw as `initialData` and persisted as a snapshot. */
export interface WhiteboardSnapshot {
  elements?: ExcalidrawElement[];
  appState?: Partial<AppState>;
}

export interface WhiteboardIdentity {
  id: string;
  displayName: string;
  avatarUrl?: string;
}
