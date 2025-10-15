import type { SupabaseClient } from '@tuturuuu/supabase/next/client';
import type { RealtimeChannel } from '@tuturuuu/supabase/next/realtime';
import debug from 'debug';
import { EventEmitter } from 'eventemitter3';
import { debounce } from 'lodash';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';

export interface SupabaseProviderConfig {
  channel: string;
  tableName: string;
  columnName: string;
  idName?: string;
  id: string | number;
  awareness?: awarenessProtocol.Awareness;
  resyncInterval?: number | false;
  saveDebounceMs?: number; // Debounce time for database saves (default: 1000ms)
}

export default class SupabaseProvider extends EventEmitter {
  public awareness: awarenessProtocol.Awareness;
  public connected = false;
  private channel: RealtimeChannel | null = null;

  private _synced: boolean = false;
  private resyncInterval: NodeJS.Timeout | undefined;
  private saveTimeout: NodeJS.Timeout | undefined;
  protected logger: debug.Debugger;
  public readonly id: number;

  public version: number = 0;
  private readonly saveDebounceMs: number = 1000; // Default debounce time

  isOnline(online?: boolean): boolean {
    if (!online && online !== false) return this.connected;
    this.connected = online;
    return this.connected;
  }

  onDocumentUpdate(update: Uint8Array, origin: any) {
    if (origin !== this) {
      this.logger(
        'document updated locally, broadcasting update to peers',
        this.isOnline()
      );
      this.emit('message', update);
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
   * Immediately save any pending changes without waiting for debounce period
   */
  flushSave() {
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
    this.emit('awareness', awarenessUpdate);
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
      const content = Array.from(Y.encodeStateAsUpdate(this.doc));

      // Skip save if content is empty
      if (!content || content.length === 0) {
        this.logger('skipping save - empty content');
        return;
      }

      this.logger(`saving ${content.length} bytes to database`);

      const { error, status } = await this.supabase
        .from(this.config.tableName as any)
        .update({ [this.config.columnName]: content })
        .eq(this.config.idName || 'id', this.config.id);

      if (error) {
        this.logger(`save failed with status ${status}:`, error);

        // Don't throw on 422 errors - just log them
        // This can happen if the task was deleted or there's a validation issue
        if (status === 422) {
          console.warn(`Failed to save Yjs state (422): ${error.message}`);
          return;
        }

        throw error;
      }

      this.logger('save successful');
      this.emit('save', this.version);
    } catch (error) {
      this.logger('unexpected error during save:', error);
      console.error('Failed to save Yjs document:', error);
    }
  }

  private async onConnect() {
    this.logger('connected');

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
    this.version++;
    Y.applyUpdate(this.doc, update, origin);
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

    // Initialize save debounce time (default: 1000ms)
    (this as any).saveDebounceMs = this.config.saveDebounceMs ?? 1000;

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
      this.logger(
        `setting resync interval to every ${(this.config.resyncInterval || 5000) / 1000} seconds`
      );
      this.resyncInterval = setInterval(() => {
        this.logger('resyncing (resync interval elapsed)');
        this.emit('message', Y.encodeStateAsUpdate(this.doc));
        if (this.channel)
          this.channel.send({
            type: 'broadcast',
            event: 'message',
            payload: Array.from(Y.encodeStateAsUpdate(this.doc)),
          });
      }, this.config.resyncInterval || 5000);
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
      if (this.channel)
        this.channel.send({
          type: 'broadcast',
          event: 'awareness',
          payload: Array.from(update),
        });
    });
    this.on('message', (update) => {
      if (this.channel)
        this.channel.send({
          type: 'broadcast',
          event: 'message',
          payload: Array.from(update),
        });
    });

    this.connect();
    this.doc.on('update', this.debouncedOnDocumentUpdate);
    this.awareness.on('update', this.onAwarenessUpdate.bind(this));
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

    if (this.resyncInterval) {
      clearInterval(this.resyncInterval);
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

    this.doc.off('update', this.debouncedOnDocumentUpdate);
    this.awareness.off('update', this.onAwarenessUpdate);

    if (this.channel) this.disconnect();
  }
}
