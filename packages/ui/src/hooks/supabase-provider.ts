import {
  createRealtimeClient,
  type RealtimeChannel,
} from '@tuturuuu/internal-api/realtime';
import type { SupabaseClient } from '@tuturuuu/supabase/next/client';
import debug from 'debug';
import { EventEmitter } from 'eventemitter3';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import { DocumentHydration } from './collaboration-document-hydration';
import { isPageVisible } from './use-page-visibility';

export const SUPABASE_PROVIDER_SYNC_ORIGIN = Symbol.for(
  'tuturuuu.supabase-provider.sync-origin'
);

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
  loadState?: () => Promise<number[] | null>;
  saveState?: (state: number[]) => Promise<boolean | undefined>;
  ownsDocument?: boolean;
}

export default class SupabaseProvider extends EventEmitter {
  public awareness: awarenessProtocol.Awareness;
  public connected = false;
  public hydrated = false;
  private connectionGeneration = 0;
  private hydration: DocumentHydration;
  private channel: RealtimeChannel | null = null;
  private realtime = createRealtimeClient();
  private pendingAwarenessClients = new Set<number>();

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
  private pendingBroadcastUpdate: Uint8Array | undefined;
  public destroyed: boolean = false;
  private _dirty: boolean = false; // Set on local edits, cleared after resync
  private awarenessDebounceTimeout: NodeJS.Timeout | undefined;
  private _handleVisibilityChange: (() => void) | null = null;
  private readonly boundAwarenessUpdate: (
    data: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => void;
  private readonly boundDocumentUpdate: (
    update: Uint8Array,
    origin: unknown
  ) => void;
  private readonly boundRemoveSelfFromAwarenessOnUnload: () => void;
  private readonly processExitHandler: () => void;

  isOnline(online?: boolean): boolean {
    if (!online && online !== false) return this.connected;
    this.connected = online;
    return this.connected;
  }

  onDocumentUpdate(update: Uint8Array, origin: unknown) {
    if (origin === this || origin === SUPABASE_PROVIDER_SYNC_ORIGIN) {
      return;
    }

    if (!this.connected || this.destroyed) {
      return;
    }

    if (!update || update.length === 0) {
      return;
    }

    this._dirty = true;
    this.synced = false;

    this.logger(
      `document updated locally (${update.length} bytes), broadcasting update to peers`
    );

    if (this.broadcastDebounceMs > 0) {
      this.pendingBroadcastUpdate = this.pendingBroadcastUpdate
        ? Y.mergeUpdates([this.pendingBroadcastUpdate, update])
        : update;

      if (this.broadcastDebounceTimeout) {
        clearTimeout(this.broadcastDebounceTimeout);
      }
      this.broadcastDebounceTimeout = setTimeout(() => {
        const pendingUpdate = this.pendingBroadcastUpdate;
        this.pendingBroadcastUpdate = undefined;
        this.broadcastDebounceTimeout = undefined;

        if (pendingUpdate && pendingUpdate.length > 0) {
          this.emit('message', pendingUpdate);
        }
      }, this.broadcastDebounceMs);
    } else {
      this.emit('message', update);
    }

    this.debouncedSave(); // Use debounced save instead of immediate
  }

  debouncedSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = undefined;
      void this.save();
    }, this.saveDebounceMs);
  }

  async flushSave() {
    if (this.broadcastDebounceTimeout) {
      clearTimeout(this.broadcastDebounceTimeout);
      this.broadcastDebounceTimeout = undefined;
      this.pendingBroadcastUpdate = undefined;

      const update = Y.encodeStateAsUpdate(this.doc);
      if (update && update.length > 0) {
        this.emit('message', update);
      }
    }

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = undefined;
      await this.save();
    }
  }

  onAwarenessUpdate(
    {
      added,
      updated,
      removed,
    }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) {
    if (origin === this || this.destroyed) return;
    for (const id of [...added, ...updated, ...removed])
      this.pendingAwarenessClients.add(id);
    if (this.awarenessDebounceTimeout) return;
    this.awarenessDebounceTimeout = setTimeout(() => {
      this.awarenessDebounceTimeout = undefined;
      const clients = [...this.pendingAwarenessClients];
      this.pendingAwarenessClients.clear();
      this.emit(
        'awareness',
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, clients)
      );
    }, 150);
  }

  removeSelfFromAwarenessOnUnload() {
    this.flushSave();
    awarenessProtocol.removeAwarenessStates(
      this.awareness,
      [this.doc.clientID],
      'window unload'
    );
  }

  async save() {
    try {
      if (!this.connected || this.destroyed) {
        this.logger('skipping save - not connected or destroyed');
        return false;
      }

      const content = Array.from(Y.encodeStateAsUpdate(this.doc));

      if (!content || content.length === 0) {
        this.logger('skipping save - empty content');
        return false;
      }

      if (content.length < 10) {
        this.logger('skipping save - content too small, possibly corrupted');
        return false;
      }

      this.logger(`saving ${content.length} bytes to database`);

      if (this.config.saveState) {
        const saved = await this.config.saveState(content);

        if (saved === false) {
          this.logger('custom saveState reported failure');
          this.synced = false;
          this.emit('error', {
            message: 'Failed to save document state',
            channelError: null,
            channel: this.config.channel,
            status: 'SAVE_FAILED',
          });
          return false;
        }
      } else {
        const { error, status } = await this.supabase
          .from(this.config.tableName as any)
          .update({ [this.config.columnName]: content })
          .eq(this.config.idName || 'id', this.config.id);

        if (error) {
          this.logger(`save failed with status ${status}:`, error);

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

            this.synced = false;

            this.logger('stopping future saves due to 422 error');
            return false;
          }

          if (status === 404) {
            console.warn(`Task ${this.config.id} not found, stopping saves`);
            this.synced = false;
            return false;
          }

          throw error;
        }
      }

      this.logger('save successful');
      this.synced = true;
      this.emit('save', this.version);
      return true;
    } catch (error: any) {
      this.logger('unexpected error during save:', error);
      console.error('Failed to save Yjs document:', {
        error,
        message: error?.message,
        taskId: this.config.id,
      });
      return false;
    }
  }

  private async onConnect() {
    this.reconnectAttempts = 0;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    const generation = this.connectionGeneration;
    if (
      !(await this.hydration.load()) ||
      this.destroyed ||
      generation !== this.connectionGeneration
    )
      return;

    this.isOnline(true);

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
      if (
        error instanceof DOMException &&
        error.name === 'NotFoundError' &&
        error.message.includes('removeChild')
      ) {
        this.logger(
          'DOM reconciliation error during Yjs update - this can happen after AFK reconnection'
        );
        console.warn(
          '[Cloudflare collaboration] DOM reconciliation error during Yjs sync. ' +
            'This is usually harmless and occurs when the editor reconnects after being idle.'
        );
        this.emit('dom-error', error);
        return;
      }
      throw error;
    }
  }

  private disconnect() {
    if (this.channel) {
      this.realtime.removeChannel(this.channel);
      this.channel = null;
    }
  }

  private connect() {
    this.channel = this.realtime.channel(this.config.channel);
    if (this.channel) {
      this.channel
        .on<number[]>('broadcast', { event: 'message' }, ({ payload }) => {
          this.onMessage(Uint8Array.from(payload), this);
        })
        .on<number[]>('broadcast', { event: 'awareness' }, ({ payload }) => {
          this.onAwareness(Uint8Array.from(payload));
        })
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            this.emit('connect', this);
          }

          if (status === 'CHANNEL_ERROR') {
            this.logger('CHANNEL_ERROR', err);
            this.emit('error', {
              message: err?.message ?? 'Channel error',
              channelError: err,
              channel: this.config.channel,
              status,
            });
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

    this.boundAwarenessUpdate = this.onAwarenessUpdate.bind(this);
    this.boundDocumentUpdate = this.onDocumentUpdate.bind(this);
    this.boundRemoveSelfFromAwarenessOnUnload =
      this.removeSelfFromAwarenessOnUnload.bind(this);
    this.processExitHandler = () => {
      this.boundRemoveSelfFromAwarenessOnUnload();
    };

    this.awareness =
      this.config.awareness || new awarenessProtocol.Awareness(doc);

    this.config = config || {};
    this.id = doc.clientID;

    (this as any).saveDebounceMs = this.config.saveDebounceMs ?? 1000;
    (this as any).broadcastDebounceMs = this.config.broadcastDebounceMs ?? 0;

    this.supabase = supabase;
    this.on('connect', this.onConnect);
    this.on('disconnect', this.onDisconnect);

    this.logger = debug(`y-${doc.clientID}`);
    this.logger.enabled = true;

    this.hydration = new DocumentHydration({
      load:
        this.config.loadState ??
        (async () => {
          const { data, error } = await this.supabase
            .from(this.config.tableName as any)
            .select<string, { [key: string]: number[] }>(this.config.columnName)
            .eq(this.config.idName || 'id', this.config.id)
            .single();
          if (error) throw error;
          return data?.[this.config.columnName] ?? null;
        }),
      apply: (state) => Y.applyUpdate(this.doc, state, this),
      isActive: () => !this.destroyed,
      onLoaded: () => {
        this.hydrated = true;
        this.emit('hydrated');
      },
      onError: () =>
        this.emit('error', {
          message: 'Unable to load collaboration document',
          channel: this.config.channel,
          status: 'DOCUMENT_ERROR',
        }),
    });
    // Durable reads must not depend on a successful peer transport connection.
    void this.hydration.load();

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
        if (!this.connected || this.destroyed) {
          this.logger('skipping resync - not connected or destroyed');
          return;
        }

        if (!isPageVisible()) {
          return;
        }

        if (!this._dirty) {
          return;
        }

        this._dirty = false;

        this.logger('resyncing (resync interval elapsed)');
        const update = Y.encodeStateAsUpdate(this.doc);

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
        this.boundRemoveSelfFromAwarenessOnUnload
      );
    } else if (typeof process !== 'undefined') {
      process.on('exit', this.processExitHandler);
    }
    this.on('awareness', (update) => {
      if (this.connected && this.channel && !this.destroyed) {
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
      if (this.connected && this.channel && !this.destroyed) {
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

    if (typeof document !== 'undefined') {
      this._handleVisibilityChange = () => {
        if (this.destroyed) return;

        if (document.visibilityState === 'visible' && !this.connected) {
          this.logger('page became visible while disconnected — reconnecting');
          this.resetAndReconnect();
        }

        if (document.visibilityState === 'hidden' && this.reconnectTimeout) {
          this.logger('page hidden during reconnect backoff — pausing timer');
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = undefined;
        }
      };
      document.addEventListener(
        'visibilitychange',
        this._handleVisibilityChange
      );
    }

    this.awareness.on('update', this.boundAwarenessUpdate);

    this.doc.on('update', this.boundDocumentUpdate);
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
      this.emit('status', [{ status: 'connecting' }]);
    }
  }

  private scheduleReconnect() {
    if (this.destroyed || this.reconnectTimeout) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('reconnect-failed');
      return;
    }

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

      this.disconnect();

      this.connect();
    }, actualDelay);
  }

  public resetAndReconnect() {
    if (this.destroyed || this.connected) return;

    this.reconnectAttempts = 0;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    this.disconnect();
    this.connect();
  }

  public onDisconnect() {
    this.connectionGeneration++;

    this.synced = false;
    this.isOnline(false);
    if (this.isOnline()) {
      this.emit('status', [{ status: 'disconnected' }]);
    }

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
  }

  public destroy() {
    if (this.destroyed) return;
    this.logger('destroying');
    const pendingSave = this.flushSave();
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
    this.pendingBroadcastUpdate = undefined;

    // Remove visibility change listener
    if (this._handleVisibilityChange && typeof document !== 'undefined') {
      document.removeEventListener(
        'visibilitychange',
        this._handleVisibilityChange
      );
      this._handleVisibilityChange = null;
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener(
        'beforeunload',
        this.boundRemoveSelfFromAwarenessOnUnload
      );
    } else if (typeof process !== 'undefined') {
      process.off('exit', this.processExitHandler);
    }

    this.awareness.off('update', this.boundAwarenessUpdate);
    this.doc.off('update', this.boundDocumentUpdate);

    if (this.channel) this.disconnect();
    if (this.config.ownsDocument) {
      this.awareness.destroy();
      void pendingSave.finally(() => this.doc.destroy());
    }
  }
}
