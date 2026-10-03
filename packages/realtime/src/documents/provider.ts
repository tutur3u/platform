import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';
import * as Y from 'yjs';
import type { RealtimeChannel } from '../channels';
import {
  DOCUMENT_CHECKPOINT_EVENT,
  type DocumentCheckpointStatus,
  documentCheckpointSchema,
} from './checkpoint';
/** Shared rich-text/code CRDT transport; persistence belongs to the room authority. */
export class CloudflareDocumentProvider {
  readonly awareness: Awareness;
  private pendingUpdates: Uint8Array[] = [];
  private pendingClients = new Set<number>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private connected = false;
  constructor(
    readonly doc: Y.Doc,
    private channel: RealtimeChannel,
    private onStatus?: (connected: boolean) => void,
    private onCheckpoint?: (status: DocumentCheckpointStatus) => void
  ) {
    this.awareness = new Awareness(doc);
    doc.on('update', this.documentUpdate);
    this.awareness.on('update', this.awarenessUpdate);
    channel
      .on('broadcast', { event: DOCUMENT_CHECKPOINT_EVENT }, ({ payload }) => {
        const parsed = documentCheckpointSchema.safeParse(payload);
        if (parsed.success && !this.closed)
          this.onCheckpoint?.(parsed.data.status);
      })
      .on<number[]>('broadcast', { event: 'message' }, ({ payload }) => {
        if (!this.validBytes(payload)) return;
        try {
          Y.applyUpdate(doc, Uint8Array.from(payload), this);
        } catch {
          this.onStatus?.(false);
        }
      })
      .on<number[]>('broadcast', { event: 'awareness' }, ({ payload }) => {
        if (!this.validBytes(payload, 16384)) return;
        try {
          applyAwarenessUpdate(this.awareness, Uint8Array.from(payload), this);
        } catch {
          /* Invalid remote awareness is ignored. */
        }
      })
      .subscribe((status) => {
        if (this.closed) return;
        this.connected = status === 'SUBSCRIBED';
        this.onStatus?.(this.connected);
        if (this.connected) {
          // Reconcile retained offline edits with the durable server state.
          this.pendingUpdates = [Y.encodeStateAsUpdate(doc)];
          this.pendingClients.add(doc.clientID);
          this.scheduleFlush();
        }
      });
  }
  private validBytes(payload: unknown, max = 512 * 1024): payload is number[] {
    return (
      Array.isArray(payload) &&
      payload.length <= max &&
      payload.every(
        (value) => Number.isInteger(value) && value >= 0 && value <= 255
      )
    );
  }
  private documentUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this || this.closed) return;
    this.pendingUpdates.push(update);
    if (this.pendingUpdates.length >= 16)
      this.pendingUpdates = [Y.mergeUpdates(this.pendingUpdates)];
    this.scheduleFlush();
  };
  private awarenessUpdate = (
    {
      added,
      updated,
      removed,
    }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => {
    if (origin === this || this.closed) return;
    for (const id of [...added, ...updated, ...removed])
      this.pendingClients.add(id);
    this.scheduleFlush();
  };
  private scheduleFlush() {
    if (this.flushTimer || !this.connected || this.closed) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, 50);
  }
  async flush() {
    if (!this.connected || this.closed) return;
    const updates = this.pendingUpdates;
    const clients = [...this.pendingClients];
    this.pendingUpdates = [];
    this.pendingClients.clear();
    try {
      if (updates.length)
        await this.channel.send({
          type: 'broadcast',
          event: 'message',
          payload: Array.from(Y.mergeUpdates(updates)),
        });
      if (clients.length)
        await this.channel.send({
          type: 'broadcast',
          event: 'awareness',
          payload: Array.from(encodeAwarenessUpdate(this.awareness, clients)),
        });
    } catch {
      this.pendingUpdates.unshift(...updates);
      for (const id of clients) this.pendingClients.add(id);
      this.connected = false;
      this.onStatus?.(false);
    }
  }
  async destroy() {
    if (this.closed) return;
    this.awareness.setLocalState(null);
    await this.flush();
    this.closed = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.doc.off('update', this.documentUpdate);
    this.awareness.off('update', this.awarenessUpdate);
    this.awareness.destroy();
    await this.channel.unsubscribe();
  }
}
