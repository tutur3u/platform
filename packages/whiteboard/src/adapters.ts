import type {
  ElementChange,
  SelectedElementIds,
  WhiteboardIdentity,
  WhiteboardSnapshot,
} from './types';
import type { WhiteboardPresenceMember } from './sync/collaborators';

export type WhiteboardConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface ElementChangeBatch {
  senderId: string;
  changes: ElementChange[];
  timestamp: number;
}

export interface CursorUpdate {
  x: number;
  y: number;
  tool?: string;
  user: WhiteboardIdentity;
}

export interface SelectionUpdate {
  senderId: string;
  selectedElementIds?: Record<string, boolean | undefined>;
  timestamp: number;
}

export interface WhiteboardTransportHandlers {
  /** The identity this client broadcasts as; used to announce departure. */
  user: WhiteboardIdentity;
  onStatus: (status: WhiteboardConnectionStatus, error?: Error) => void;
  onElementChanges: (batch: ElementChangeBatch) => void;
  onCursor: (update: CursorUpdate) => void;
  onSelection: (update: SelectionUpdate) => void;
}

/**
 * Moves element deltas, cursors and selections between peers. Implementations
 * own connection lifetime; `connect` returns the matching disconnect.
 */
export interface WhiteboardTransport {
  connect(handlers: WhiteboardTransportHandlers): () => void;
  sendElementChanges(batch: ElementChangeBatch): Promise<void>;
  sendCursor(update: CursorUpdate): Promise<void>;
  sendSelection(update: SelectionUpdate): Promise<void>;
  /** Optional roster of who is on the board; consumers may pass their own. */
  subscribePresence?(
    listener: (members: WhiteboardPresenceMember[]) => void
  ): () => void;
}

export interface StoredWhiteboardSnapshot {
  snapshot: WhiteboardSnapshot | null;
  /** Opaque revision token; changes whenever the stored snapshot changes. */
  revision: string | null;
}

export interface WhiteboardPersistence {
  load(): Promise<StoredWhiteboardSnapshot>;
  /** Stores the snapshot and returns the new revision, if the store has one. */
  save(snapshot: WhiteboardSnapshot): Promise<{ revision: string | null }>;
}

export interface WhiteboardAssets {
  /** Uploads an image and returns the file id the scene should reference. */
  upload(file: File): Promise<string>;
  /** Resolves a stored file id to a fetchable url. */
  resolveUrl(fileId: string): Promise<string | null>;
}

export type { SelectedElementIds };
