import type { SupabaseClient } from '@tuturuuu/supabase/next/client';
import type { RealtimeChannel } from '@tuturuuu/supabase/next/realtime';
import debug from 'debug';
import { EventEmitter } from 'eventemitter3';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import { isPageVisible } from './use-page-visibility';

export interface SupabaseProviderConfig {
  channel: string;
  tableName: string;
  columnName: string;
  idName?: string;
  id: string | number;
  awareness?: awarenessProtocol.Awareness;
  resyncInterval?: number | false;
  saveDebounceMs?: number; // Debounce time for database saves (default: 1000ms)
  broadcastDebounceMs?: number; // Debounce time for broadcasting updates (0 = immediate, default: 0)
}

export default class SupabaseProvider extends EventEmitter {
  public awareness: awarenessProtocol.Awareness;
  public connected = false;
  private channel: RealtimeChannel | null = null;

  private _synced: boolean = false;
  private resyncInterval: NodeJS.Timeout | undefined;
  private saveTimeout: NodeJS.Timeout | undefined;
  private reconnectTimeout: NodeJS.Timeout | undefined;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000; // Start with 1 second
  private maxReconnectDelay: number = 30000; // Max 30 seconds
  protected logger: debug.Debugger;
  public readonly id: number;

  public version: number = 0;
  private readonly saveDebounceMs: number = 1000; // Default debounce time
  private readonly broadcastDebounceMs: number = 0; // Default: immediate
  private broadcastDebounceTimeout: NodeJS.Timeout | undefined;
  public destroyed: boolean = false;
  private _dirty: boolean = false; // Set on local edits, cleared after resync
  private awarenessDebounceTimeout: NodeJS.Timeout | undefined;

  isOnline(online?: boolean): boolean {
    if (!online && online !== false) return this.connected;
    this.connected = online;
    return this.connected;
  }

  onDocumentUpdate(update: Uint8Array, origin: any) {
    if (origin !== this) {
      // Only broadcast and save if connected and not destroyed
      if (!this.connected || this.destroyed) {
        this.logger('skipping broadcast - not connected or destroyed');
        return;
      }

      // Validate update size (avoid broadcasting empty or corrupted updates)
      if (!update || update.length === 0) {
        this.logger('skipping broadcast - empty update');
        return;
      }

      this._dirty = true;

      this.logger(
        `document updated locally (${update.length} bytes), broadcasting update to peers`
      );

      if (this.broadcastDebounceMs > 0) {
        // Debounced broadcast for free tier — coalesce rapid edits
        if (this.broadcastDebounceTimeout) {
          clearTimeout(this.broadcastDebounceTimeout);
        }
        this.broadcastDebounceTimeout = setTimeout(() => {
          this.emit('message', update);
        }, this.broadcastDebounceMs);
      } else {
        // Immediate broadcast for paid tier
        this.emit('message', update);
      }

      this.debouncedSave(); // Use debounced save instead of immediate
    }
  }

  debouncedSave() {
    // Clear any pending save
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Schedule a new save after the debounce period
    this.saveTimeout = setTimeout(() => {
      this.logger('debounce period elapsed, saving to database');
      this.save();
    }, this.saveDebounceMs);
  }

  /**
   * Immediately save any pending changes without waiting for debounce period.
   * Also flushes any pending broadcast.
   */
  flushSave() {
    // Flush pending broadcast first
    if (this.broadcastDebounceTimeout) {
      clearTimeout(this.broadcastDebounceTimeout);
      this.broadcastDebounceTimeout = undefined;
    }

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = undefined;
      this.logger('flushing pending save immediately');
      this.save();
    }
  }

  onAwarenessUpdate({ added, updated, removed }: any, _origin: any) {
    const changedClients = added.concat(updated).concat(removed);
    const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(
      this.awareness,
      changedClients
    );

    // Debounce awareness broadcasts to coalesce rapid cursor/selection changes
    if (this.awarenessDebounceTimeout) {
      clearTimeout(this.awarenessDebounceTimeout);
    }
    this.awarenessDebounceTimeout = setTimeout(() => {
      this.emit('awareness', awarenessUpdate);
    }, 150);
  }

  removeSelfFromAwarenessOnUnload() {
    // Flush any pending saves before unload
    this.flushSave();
    awarenessProtocol.removeAwarenessStates(
      this.awareness,
      [this.doc.clientID],
      'window unload'
    );
  }

  async save() {
    try {
      // Don't save if not connected or destroyed
      if (!this.connected || this.destroyed) {
        this.logger('skipping save - not connected or destroyed');
        return;
      }

      const content = Array.from(Y.encodeStateAsUpdate(this.doc));

      // Skip save if content is empty or too small (likely invalid)
      if (!content || content.length === 0) {
        this.logger('skipping save - empty content');
        return;
      }

      // Skip save if content is suspiciously small (might be corrupted)
      if (content.length < 10) {
        this.logger('skipping save - content too small, possibly corrupted');
        return;
      }

      this.logger(`saving ${content.length} bytes to database`);

      const { error, status } = await this.supabase
        .from(this.config.tableName as any)
        .update({ [this.config.columnName]: content })
        .eq(this.config.idName || 'id', this.config.id);

      if (error) {
        this.logger(`save failed with status ${status}:`, error);

        // Handle 422 errors - task was deleted, validation failed, or RLS rejected
        if (status === 422) {
          console.warn(
            `Failed to save Yjs state (422 - Unprocessable Entity):`,
            {
              message: error.message,
              details: error.details,
              hint: error.hint,
              taskId: this.config.id,
            }
          );

          // Mark as not synced so UI shows warning
          this.synced = false;

          // Stop trying to save this document
          this.logger('stopping future saves due to 422 error');
          return;
        }

        // Handle 404 errors - task doesn't exist
        if (status === 404) {
          console.warn(`Task ${this.config.id} not found, stopping saves`);
          this.synced = false;
          return;
        }

        throw error;
      }

      this.logger('save successful');
      this.emit('save', this.version);
    } catch (error: any) {
      this.logger('unexpected error during save:', error);
      console.error('Failed to save Yjs document:', {
        error,
        message: error?.message,
        taskId: this.config.id,
      });
    }
  }

  private async onConnect() {
    this.logger('connected');

    // Reset reconnect attempts on successful connection
    this.reconnectAttempts = 0;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    const { data, status } = await this.supabase
      .from(this.config.tableName as any)
      .select<string, { [key: string]: number[] }>(`${this.config.columnName}`)
      .eq(this.config.idName || 'id', this.config.id)
      .single();

    this.logger('retrieved data from supabase', status);

    if (data?.[this.config.columnName]) {
      this.logger('applying update to yjs');
      try {
        this.applyUpdate(Uint8Array.from(data[this.config.columnName] ?? []));
      } catch (error) {
        this.logger(error);
      }
    }

    this.logger('setting connected flag to true');
    this.isOnline(true);

    // Mark as synced after loading initial data
    this.synced = true;

    this.emit('status', [{ status: 'connected' }]);

    if (this.awareness.getLocalState() !== null) {
      const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(
        this.awareness,
        [this.doc.clientID]
      );
      this.emit('awareness', awarenessUpdate);
    }
  }

  private applyUpdate(update: Uint8Array, origin?: any) {
    try {
      this.version++;
      Y.applyUpdate(this.doc, update, origin);
    } catch (error) {
      // Handle DOM reconciliation errors during Yjs sync
      // This happens when ProseMirror/Tiptap tries to manipulate DOM nodes
      // that React has already cleaned up during reconnection scenarios
      if (
        error instanceof DOMException &&
        error.name === 'NotFoundError' &&
        error.message.includes('removeChild')
      ) {
        this.logger(
          'DOM reconciliation error during Yjs update - this can happen after AFK reconnection'
        );
        console.warn(
          '[SupabaseProvider] DOM reconciliation error during Yjs sync. ' +
            'This is usually harmless and occurs when the editor reconnects after being idle.'
        );
        // Emit event so the component can handle recovery if needed
        this.emit('dom-error', error);
        return;
      }
      // Re-throw other errors
      throw error;
    }
  }

  private disconnect() {
    if (this.channel) {
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  private connect() {
    this.channel = this.supabase.channel(this.config.channel);
    if (this.channel) {
      this.channel
        .on('broadcast', { event: 'message' }, ({ payload }) => {
          this.onMessage(Uint8Array.from(payload), this);
        })
        .on('broadcast', { event: 'awareness' }, ({ payload }) => {
          this.onAwareness(Uint8Array.from(payload));
        })
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            this.emit('connect', this);
          }

          if (status === 'CHANNEL_ERROR') {
            this.logger('CHANNEL_ERROR', err);
            this.emit('error', this);
            this.emit('disconnect', this);
          }

          if (status === 'TIMED_OUT') {
            this.emit('disconnect', this);
          }

          if (status === 'CLOSED') {
            this.emit('disconnect', this);
          }
        });
    }
  }

  constructor(
    private doc: Y.Doc,
    private supabase: SupabaseClient,
    private config: SupabaseProviderConfig
  ) {
    super();

    this.awareness =
      this.config.awareness || new awarenessProtocol.Awareness(doc);

    this.config = config || {};
    this.id = doc.clientID;

    // Initialize debounce times
    (this as any).saveDebounceMs = this.config.saveDebounceMs ?? 1000;
    (this as any).broadcastDebounceMs = this.config.broadcastDebounceMs ?? 0;

    this.supabase = supabase;
    this.on('connect', this.onConnect);
    this.on('disconnect', this.onDisconnect);

    this.logger = debug(`y-${doc.clientID}`);
    // turn on debug logging to the console
    this.logger.enabled = true;

    this.logger('constructor initializing');
    this.logger('connecting to Supabase Realtime', doc.guid);
    this.logger(`save debounce set to ${this.saveDebounceMs}ms`);

    if (
      this.config.resyncInterval ||
      typeof this.config.resyncInterval === 'undefined'
    ) {
      if (this.config.resyncInterval && this.config.resyncInterval < 3000) {
        throw new Error('resync interval of less than 3 seconds');
      }
      const interval = this.config.resyncInterval || 30000;
      this.logger(
        `setting resync interval to every ${interval / 1000} seconds`
      );
      this.resyncInterval = setInterval(() => {
        // Only resync if connected and not destroyed
        if (!this.connected || this.destroyed) {
          this.logger('skipping resync - not connected or destroyed');
          return;
        }

        // Skip resync when page is hidden (no one is watching)
        if (!isPageVisible()) {
          this.logger('skipping resync - page not visible');
          return;
        }

        // Skip resync if no local changes since last resync
        if (!this._dirty) {
          this.logger('skipping resync - no local changes');
          return;
        }

        this._dirty = false;

        this.logger('resyncing (resync interval elapsed)');
        const update = Y.encodeStateAsUpdate(this.doc);

        // Validate update before broadcasting
        if (!update || update.length === 0) {
          this.logger('skipping resync - empty update');
          return;
        }

        this.emit('message', update);
        if (this.channel) {
          this.channel.send({
            type: 'broadcast',
            event: 'message',
            payload: Array.from(update),
          });
        }
      }, interval);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener(
        'beforeunload',
        this.removeSelfFromAwarenessOnUnload
      );
    } else if (typeof process !== 'undefined') {
      process.on('exit', () => this.removeSelfFromAwarenessOnUnload);
    }
    this.on('awareness', (update) => {
      // Only broadcast if connected and channel exists
      if (this.connected && this.channel && !this.destroyed) {
        // Validate update before broadcasting
        if (update && update.length > 0) {
          this.channel.send({
            type: 'broadcast',
            event: 'awareness',
            payload: Array.from(update),
          });
        }
      }
    });
    this.on('message', (update) => {
      // Only broadcast if connected and channel exists
      if (this.connected && this.channel && !this.destroyed) {
        // Validate update before broadcasting
        if (update && update.length > 0) {
          this.channel.send({
            type: 'broadcast',
            event: 'message',
            payload: Array.from(update),
          });
        }
      }
    });

    this.connect();
    this.awareness.on('update', this.onAwarenessUpdate.bind(this));

    // Listen to document updates and broadcast them to peers
    this.doc.on('update', this.onDocumentUpdate.bind(this));
  }

  get synced() {
    return this._synced;
  }

  set synced(state) {
    if (this._synced !== state) {
      this.logger('setting sync state to ', state);
      this._synced = state;
      this.emit('synced', [state]);
      this.emit('sync', [state]);
    }
  }

  public onConnecting() {
    if (!this.isOnline()) {
      this.logger('connecting');
      this.emit('status', [{ status: 'connecting' }]);
    }
  }

  private scheduleReconnect() {
    if (this.destroyed || this.reconnectTimeout) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger('max reconnect attempts reached');
      this.emit('reconnect-failed');
      return;
    }

    // Exponential backoff with jitter
    const delay = Math.min(
      this.reconnectDelay * 2 ** this.reconnectAttempts,
      this.maxReconnectDelay
    );
    const jitter = Math.random() * 1000; // Add up to 1 second jitter
    const actualDelay = delay + jitter;

    this.logger(
      `scheduling reconnect attempt ${this.reconnectAttempts + 1} in ${Math.round(actualDelay)}ms`
    );

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = undefined;
      this.reconnectAttempts++;
      this.logger(`reconnect attempt ${this.reconnectAttempts}`);

      // Disconnect old channel if it exists
      this.disconnect();

      // Try to reconnect
      this.connect();
    }, actualDelay);
  }

  public onDisconnect() {
    this.logger('disconnected');

    this.synced = false;
    this.isOnline(false);
    this.logger('set connected flag to false');
    if (this.isOnline()) {
      this.emit('status', [{ status: 'disconnected' }]);
    }

    // update awareness (keep all users except local)
    // FIXME? compare to broadcast channel behavior
    const states = Array.from(this.awareness.getStates().keys()).filter(
      (client) => client !== this.doc.clientID
    );
    awarenessProtocol.removeAwarenessStates(this.awareness, states, this);

    // Auto-reconnect if not destroyed
    if (!this.destroyed) {
      this.scheduleReconnect();
    }
  }

  public onMessage(message: Uint8Array, _origin: any) {
    if (!this.isOnline()) return;
    try {
      this.applyUpdate(message, this);
    } catch (err) {
      this.logger(err);
    }
  }

  public onAwareness(message: Uint8Array) {
    awarenessProtocol.applyAwarenessUpdate(this.awareness, message, this);
  }

  public onAuth(message: Uint8Array) {
    this.logger(`received ${message.byteLength} bytes from peer: ${message}`);

    if (!message) {
      this.logger(`Permission denied to channel`);
    }
    this.logger('processed message (type = MessageAuth)');
  }

  public destroy() {
    this.logger('destroying');
    this.destroyed = true;

    // Clear reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    if (this.resyncInterval) {
      clearInterval(this.resyncInterval);
    }

    if (this.awarenessDebounceTimeout) {
      clearTimeout(this.awarenessDebounceTimeout);
    }

    if (this.broadcastDebounceTimeout) {
      clearTimeout(this.broadcastDebounceTimeout);
    }

    // Save any pending changes before destroying
    this.flushSave();

    if (typeof window !== 'undefined') {
      window.removeEventListener(
        'beforeunload',
        this.removeSelfFromAwarenessOnUnload
      );
    } else if (typeof process !== 'undefined') {
      process.off('exit', () => this.removeSelfFromAwarenessOnUnload);
    }

    this.awareness.off('update', this.onAwarenessUpdate);
    this.doc.off('update', this.onDocumentUpdate);

    if (this.channel) this.disconnect();
  }
}
