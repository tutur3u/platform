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

/** Which of the transport's channels a status or error came from. */
export type WhiteboardChannelKind = 'elements' | 'cursors';

export interface WhiteboardTransportHandlers {
  /** The identity this client broadcasts as; used to announce departure. */
  user: WhiteboardIdentity;
  /** `channel` is set on errors so hosts can treat element and cursor failures differently. */
  onStatus: (
    status: WhiteboardConnectionStatus,
    error?: Error,
    channel?: WhiteboardChannelKind
  ) => void;
  onElementChanges: (batch: ElementChangeBatch) => void;
  onCursor: (update: CursorUpdate) => void;
  onSelection: (update: SelectionUpdate) => void;
}

/**
 * Moves element deltas, cursors and selections between peers. Implementations
 * own connection lifetime; `connect` returns the matching disconnect. A
 * transport serves one consumer at a time: create one per editor.
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
  /**
   * Reads the stored snapshot. The editor never calls this: hosts own
   * fetching (caching, retries, refetch triggers) and hand the result to the
   * editor as `storedSnapshot`.
   */
  load?(): Promise<StoredWhiteboardSnapshot>;
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
