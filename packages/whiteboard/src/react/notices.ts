/** Events the editor raises for its host to surface in its own UI. */
export type WhiteboardNotice =
  | { kind: 'save-failed'; message: string; retry: () => void }
  | { kind: 'collaboration-error'; error: Error }
  | { kind: 'paste-image-unreadable' }
  | { kind: 'paste-image-restricted' };

export type WhiteboardSyncStatus = 'synced' | 'syncing' | 'error';

export interface WhiteboardEditorStatus {
  syncStatus: WhiteboardSyncStatus;
  lastSyncError: string | null;
  isConnected: boolean;
}

export interface WhiteboardEditorHandle {
  /** Saves immediately, cancelling any pending auto-save. */
  save: () => Promise<void>;
}
