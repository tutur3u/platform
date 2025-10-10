import type { RealtimeChannel } from '@supabase/supabase-js';
import type { JSONContent } from '@tiptap/react';
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
  private contentInitialized = false;
  private stateRequestTimeout: NodeJS.Timeout | null = null;

  constructor(config: SupabaseRealtimeProviderConfig) {
    this.channel = config.channel;
    this.doc = config.doc;
    this.awareness = config.awareness;
    this.onSync = config.onSync;
    this.onError = config.onError;

    this.init();
    this.setupIncomingListeners();
    this.onSync?.(true);
  }

  private init() {
    // 1. Listen to local document changes → broadcast to others
    this.updateHandler = (update: Uint8Array, origin: any) => {
      if (origin !== 'remote') {
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
  }

  /**
   * Initialize document content if we're the first user
   * Should be called after checking presence
   */
  public initializeContent(initialContent?: JSONContent | null) {
    if (this.contentInitialized) return;

    console.log('🔄 Initializing Yjs doc with initial content', initialContent);
    // Only initialize with initial content if we're alone
    if (initialContent) {
      try {
        // Initialize Y.Doc with the initial content
        const fragment = this.doc.getXmlFragment('prosemirror');

        // Clear any existing content
        fragment.delete(0, fragment.length);

        // Convert JSONContent to Y.XmlElement
        this.applyJSONContentToFragment(fragment, initialContent);

        console.log('🔄 Initialized Yjs doc with initial content (first user)');
      } catch (error) {
        console.error('Failed to initialize Yjs doc:', error);
        this.onError?.(error as Error);
      }
    }

    this.contentInitialized = true;
  }

  /**
   * Request the current document state from other clients
   * Called when joining an existing session
   */
  public requestState() {
    console.log('📡 Requesting document state from peers');
    this.channel.send({
      type: 'broadcast',
      event: 'request-state',
      payload: { clientId: this.doc.clientID },
    });

    // Set timeout - if no response in 2 seconds, we're probably the first user
    this.stateRequestTimeout = setTimeout(() => {
      console.log('⏱️ State request timeout - no peers responded');
    }, 2000);
  }

  /**
   * Send current document state to a requesting client
   */
  private sendState(targetClientId?: number) {
    console.log('📤 Sending document state to peer', targetClientId);
    const stateVector = Y.encodeStateAsUpdate(this.doc);
    this.channel.send({
      type: 'broadcast',
      event: 'state-response',
      payload: {
        state: Array.from(stateVector),
        targetClientId,
      },
    });
  }

  /**
   * Apply received document state from another client
   */
  private applyState(state: Uint8Array) {
    if (this.contentInitialized) {
      console.log('⚠️ Content already initialized, skipping state application');
      return;
    }

    console.log('📥 Applying document state from peer');
    try {
      Y.applyUpdate(this.doc, state, 'remote');
      this.contentInitialized = true;

      if (this.stateRequestTimeout) {
        clearTimeout(this.stateRequestTimeout);
        this.stateRequestTimeout = null;
      }

      console.log('✅ Document state applied successfully');
    } catch (error) {
      console.error('Failed to apply state:', error);
      this.onError?.(error as Error);
    }
  }

  /**
   * Helper to convert JSONContent to Y.XmlFragment
   */
  private applyJSONContentToFragment(
    fragment: Y.XmlFragment,
    content: JSONContent
  ) {
    if (!content.content) return;

    for (const node of content.content) {
      if (node.type === 'text' && node.text) {
        fragment.insert(fragment.length, [new Y.XmlText(node.text)]);
      } else if (node.type) {
        const element = new Y.XmlElement(node.type);

        // Set attributes
        if (node.attrs) {
          for (const [key, value] of Object.entries(node.attrs)) {
            element.setAttribute(key, String(value));
          }
        }

        // Recursively add content
        if (node.content) {
          this.applyJSONContentToFragment(element, {
            content: node.content,
          } as JSONContent);
        }

        fragment.insert(fragment.length, [element]);
      }
    }
  }

  private setupIncomingListeners() {
    // 3. Receive document updates from other clients → apply locally
    this.channel.on(
      'broadcast',
      { event: 'yjs-update' },
      ({ payload }: { payload: { update: number[] } }) => {
        try {
          // Apply update
          const updateBytes = new Uint8Array(payload.update);
          Y.applyUpdate(this.doc, updateBytes, 'remote');
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

    // 5. Handle state requests from new clients
    this.channel.on(
      'broadcast',
      { event: 'request-state' },
      ({ payload }: { payload: { clientId: number } }) => {
        console.log('📨 Received state request from client', payload.clientId);
        // Only respond if we have initialized content
        if (this.contentInitialized && this.doc.store.clients.size > 0) {
          this.sendState(payload.clientId);
        }
      }
    );

    // 6. Handle state responses from existing clients
    this.channel.on(
      'broadcast',
      { event: 'state-response' },
      ({
        payload,
      }: {
        payload: { state: number[]; targetClientId?: number };
      }) => {
        console.log(
          '📨 Received state response',
          payload.targetClientId,
          this.doc.clientID
        );
        // Apply state if it's meant for us (or broadcast to all)
        if (
          !payload.targetClientId ||
          payload.targetClientId === this.doc.clientID
        ) {
          const stateBytes = new Uint8Array(payload.state);
          this.applyState(stateBytes);
        }
      }
    );
  }

  /**
   * Clean up: remove listeners and clear awareness
   */
  destroy() {
    if (this.awarenessTimer) clearTimeout(this.awarenessTimer);
    if (this.stateRequestTimeout) clearTimeout(this.stateRequestTimeout);
    if (this.updateHandler) this.doc.off('update', this.updateHandler);
    if (this.awarenessUpdateHandler)
      this.awareness.off('update', this.awarenessUpdateHandler);
    removeAwarenessStates(this.awareness, [this.doc.clientID], 'cleanup');
  }
}
