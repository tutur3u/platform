import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Awareness } from 'y-protocols/awareness';
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import * as Y from 'yjs';

export interface SupabaseRealtimeProviderConfig {
  channel: RealtimeChannel;
  doc: Y.Doc;
  awareness: Awareness;
  onSync?: (synced: boolean) => void;
  onError?: (error: Error) => void;
}

/**
 * Simplified Supabase Realtime Provider for Yjs
 * Syncs document updates and awareness (cursors) through Supabase realtime
 */
export class SupabaseRealtimeProvider {
  private channel: RealtimeChannel;
  private doc: Y.Doc;
  private awareness: Awareness;
  private onSync?: (synced: boolean) => void;
  private onError?: (error: Error) => void;
  private updateHandler: ((update: Uint8Array, origin: any) => void) | null =
    null;
  private awarenessUpdateHandler: ((changed: any, origin: any) => void) | null =
    null;
  private awarenessTimer: NodeJS.Timeout | null = null;

  constructor(config: SupabaseRealtimeProviderConfig) {
    this.channel = config.channel;
    this.doc = config.doc;
    this.awareness = config.awareness;
    this.onSync = config.onSync;
    this.onError = config.onError;

    this.init();
  }

  private init() {
    // 1. Listen to local document changes → broadcast to others
    this.updateHandler = (update: Uint8Array, origin: any) => {
      if (origin !== 'remote') {
        console.log('Sending Yjs update');
        this.channel.send({
          type: 'broadcast',
          event: 'yjs-update',
          payload: { update: Array.from(update) },
        });
      }
    };
    this.doc.on('update', this.updateHandler);

    // 2. Listen to local awareness changes (cursors) → broadcast (debounced)
    this.awarenessUpdateHandler = (_changed: any, origin: any) => {
      if (origin !== 'remote') {
        if (this.awarenessTimer) clearTimeout(this.awarenessTimer);
        this.awarenessTimer = setTimeout(() => {
          const update = encodeAwarenessUpdate(this.awareness, [
            this.doc.clientID,
          ]);
          this.channel.send({
            type: 'broadcast',
            event: 'awareness-update',
            payload: { update: Array.from(update) },
          });
        }, 100);
      }
    };
    this.awareness.on('update', this.awarenessUpdateHandler);

    this.setupIncomingListeners();

    this.onSync?.(true);
  }

  private setupIncomingListeners() {
    // 3. Receive document updates from other clients → apply locally
    this.channel.on(
      'broadcast',
      { event: 'yjs-update' },
      ({ payload }: { payload: { update: number[] } }) => {
        try {
          // Fragment state BEFORE apply
          const fragmentBefore = this.doc.getXmlFragment('prosemirror');
          console.log('Fragment BEFORE:', {
            length: fragmentBefore.length,
            content: fragmentBefore.toArray().map((n) => n.toJSON()),
          });

          // Convert và decode update để xem chi tiết
          const updateBytes = new Uint8Array(payload.update);

          // Apply update
          console.log('Applying update...');
          Y.applyUpdate(this.doc, updateBytes, 'remote');

          // Fragment state AFTER apply
          const fragmentAfter = this.doc.getXmlFragment('prosemirror');
          console.log('Fragment AFTER:', {
            length: fragmentAfter.length,
            content: fragmentAfter.toArray().map((n) => n.toJSON()),
          });
        } catch (error) {
          console.error('Error in yjs-update handler:', error);
          this.onError?.(error as Error);
        }
      }
    );

    // 4. Receive awareness updates (cursors) from other clients → apply locally
    this.channel.on(
      'broadcast',
      { event: 'awareness-update' },
      ({ payload }: { payload: { update: number[] } }) => {
        try {
          applyAwarenessUpdate(
            this.awareness,
            new Uint8Array(payload.update),
            'remote'
          );
        } catch (error) {
          this.onError?.(error as Error);
        }
      }
    );
  }

  /**
   * Clean up: remove listeners and clear awareness
   */
  destroy() {
    if (this.awarenessTimer) clearTimeout(this.awarenessTimer);
    if (this.updateHandler) this.doc.off('update', this.updateHandler);
    if (this.awarenessUpdateHandler)
      this.awareness.off('update', this.awarenessUpdateHandler);
    removeAwarenessStates(this.awareness, [this.doc.clientID], 'cleanup');
  }
}
