import * as Y from 'yjs';
import type { CollaborationPresence } from './index';

const REMOTE = 'tuturuuu.remote';
function base64(bytes: Uint8Array) {
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
}
function bytes(raw: string) {
  return Uint8Array.from(atob(raw), (char) => char.charCodeAt(0));
}
export class ProgrammingCollaborationClient {
  readonly doc = new Y.Doc();
  private socket: WebSocket | null = null;
  private stopped = false;
  private reconnect = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceValue: Pick<
    CollaborationPresence,
    'file' | 'cursor' | 'pointer' | 'selection'
  > = { file: null, cursor: null, pointer: null };
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: Uint8Array[] = [];
  private ticket = '';
  private endpoint = '';
  private synced = false;
  private presenceAt = 0;
  constructor(
    private readonly notify: (event: {
      status?: 'connecting' | 'open' | 'offline';
      presence?: CollaborationPresence[];
      savedRevision?: number;
      saveError?: boolean;
    }) => void
  ) {
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE) return;
      this.pending.push(update);
      if (!this.flushTimer)
        this.flushTimer = setTimeout(() => this.flush(), 50);
    });
  }
  connect(endpoint: string, ticket: string) {
    if (this.ticket === ticket && this.endpoint === endpoint) return;
    const sameEndpoint = this.endpoint === endpoint;
    const url = new URL(endpoint);
    if (
      url.protocol !== 'wss:' &&
      !(
        url.protocol === 'ws:' &&
        ['127.0.0.1', 'localhost'].includes(url.hostname)
      )
    )
      throw new Error('Invalid collaboration endpoint');
    this.ticket = ticket;
    this.endpoint = endpoint;
    if (
      sameEndpoint &&
      this.synced &&
      this.socket?.readyState === WebSocket.OPEN
    ) {
      this.socket.send(JSON.stringify({ type: 'authenticate', token: ticket }));
      return;
    }
    const previous = this.socket;
    this.socket = null;
    previous?.close();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.open();
  }
  private open() {
    if (this.stopped) return;
    this.synced = false;
    this.notify({ status: 'connecting' });
    const url = new URL(this.endpoint);
    url.searchParams.set('token', this.ticket);
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.onmessage = (event) => {
      if (
        this.socket !== socket ||
        typeof event.data !== 'string' ||
        new TextEncoder().encode(event.data).length > 4_500_000
      )
        return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'sync') {
          Y.applyUpdate(this.doc, bytes(message.update), REMOTE);
          this.synced = true;
          this.reconnect = 0;
          this.notify({ status: 'open' });
          const unsent = Y.encodeStateAsUpdate(
            this.doc,
            bytes(message.stateVector)
          );
          if (unsent.length > 2) this.pending.push(unsent);
          this.flush();
        } else if (message.type === 'update')
          Y.applyUpdate(this.doc, bytes(message.update), REMOTE);
        else if (message.type === 'presence')
          this.notify({ presence: message.participants });
        else if (message.type === 'saved')
          this.notify({ savedRevision: message.revision, saveError: false });
        else if (message.type === 'save-error')
          this.notify({ saveError: true });
      } catch {
        socket.close(1008, 'Invalid collaboration message');
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket || this.stopped) return;
      this.notify({ status: 'offline' });
      this.retryTimer = setTimeout(
        () => this.open(),
        Math.min(15000, 500 * 2 ** this.reconnect++) + Math.random() * 250
      );
    };
    socket.onerror = () => socket.close();
  }
  private flush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (
      !this.synced ||
      this.socket?.readyState !== WebSocket.OPEN ||
      !this.pending.length
    )
      return;
    const update = Y.mergeUpdates(this.pending);
    this.socket.send(
      JSON.stringify({ type: 'update', update: base64(update) })
    );
    this.pending = [];
  }
  presence(
    presence: Partial<
      Pick<CollaborationPresence, 'file' | 'cursor' | 'pointer' | 'selection'>
    >
  ) {
    this.presenceValue = { ...this.presenceValue, ...presence };
    if (this.presenceTimer) return;
    this.presenceTimer = setTimeout(
      () => {
        this.presenceTimer = null;
        if (this.socket?.readyState === WebSocket.OPEN)
          this.socket.send(
            JSON.stringify({ type: 'presence', presence: this.presenceValue })
          );
      },
      Math.max(0, 100 - (Date.now() - this.presenceAt))
    );
    this.presenceAt = Date.now();
  }

  destroy() {
    this.stopped = true;
    if (this.presenceTimer) clearTimeout(this.presenceTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.socket?.close();
    this.doc.destroy();
  }
}
