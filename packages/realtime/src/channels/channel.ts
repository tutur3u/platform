import {
  type BroadcastMessage,
  CHANNEL_FRAME_BYTES,
  type ChannelOptions,
  type ChannelStatus,
  channelServerFrameSchema,
  type RealtimeJoin,
  type RealtimePresenceState,
} from './schema';

export type BroadcastListener<T> = (message: { payload: T }) => void;
export type PresenceListener<T> = (message: {
  key: string;
  newPresences: T[];
  leftPresences: T[];
}) => void;
type Listener = (message: unknown) => void;
export class RealtimeChannel {
  private listeners: { type: string; event: string; callback: Listener }[] = [];
  private socket: WebSocket | null = null;
  private presence: RealtimePresenceState = {};
  private tracked: Record<string, unknown> | null = null;
  private subscribed:
    | ((status: ChannelStatus, error?: Error) => void)
    | undefined;
  private stopped = true;
  private refresh: ReturnType<typeof setTimeout> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private generation = 0;
  private ready: Promise<void> | null = null;
  private endpoint: string | null = null;
  private role: 'editor' | 'viewer' = 'editor';
  state = 'closed';
  constructor(
    readonly topic: string,
    private options: ChannelOptions,
    private join: () => Promise<RealtimeJoin>
  ) {}
  on<T = unknown>(
    type: 'broadcast',
    filter: { event: string },
    callback: BroadcastListener<T>
  ): this;
  on<T = Record<string, unknown>>(
    type: 'presence',
    filter: { event: string },
    callback: PresenceListener<T>
  ): this;
  on(
    type: 'broadcast' | 'presence',
    filter: { event: string },
    callback: BroadcastListener<unknown> | PresenceListener<unknown>
  ) {
    this.listeners.push({
      type,
      event: filter.event,
      callback: callback as Listener,
    });
    return this;
  }
  subscribe(callback?: (status: ChannelStatus, error?: Error) => void) {
    this.subscribed = callback;
    this.stopped = false;
    this.ready ??= this.connect();
    return this;
  }
  private emit(type: string, event: string, message: unknown) {
    for (const listener of this.listeners)
      if (
        listener.type === type &&
        (listener.event === event || listener.event === '*')
      )
        listener.callback(message);
  }
  private async connect() {
    const generation = ++this.generation;
    this.state = 'joining';
    try {
      const ticket = await this.join();
      if (this.stopped || generation !== this.generation) return;
      this.role = ticket.role ?? 'editor';
      const url = new URL(ticket.endpoint);
      this.endpoint = url.toString();
      if (!['wss:', 'ws:'].includes(url.protocol))
        throw new Error('Invalid realtime endpoint');
      if (
        url.protocol === 'ws:' &&
        !['127.0.0.1', 'localhost'].includes(url.hostname)
      )
        throw new Error('Insecure realtime endpoint');
      url.searchParams.set('token', ticket.token);
      url.searchParams.set(
        'self',
        String(this.options.config?.broadcast?.self === true)
      );
      const socket = new WebSocket(url);
      const old = this.socket;
      this.socket = socket;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Realtime connection timed out')),
          10000
        );
        socket.addEventListener(
          'open',
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true }
        );
        socket.addEventListener(
          'error',
          () => {
            clearTimeout(timeout);
            reject(new Error('Realtime connection failed'));
          },
          { once: true }
        );
        socket.addEventListener('message', (event) => {
          if (
            this.stopped ||
            generation !== this.generation ||
            typeof event.data !== 'string' ||
            new TextEncoder().encode(event.data).length > CHANNEL_FRAME_BYTES
          )
            return;
          try {
            const message = channelServerFrameSchema.parse(
              JSON.parse(event.data)
            );
            if (message.type === 'broadcast')
              this.emit('broadcast', message.event, {
                payload: message.payload,
              });
            else if (message.type === 'presence') {
              const previous = this.presence;
              this.presence = message.state;
              for (const key of Object.keys(this.presence))
                if (!previous[key])
                  this.emit('presence', 'join', {
                    key,
                    newPresences: this.presence[key],
                  });
              for (const key of Object.keys(previous))
                if (!this.presence[key])
                  this.emit('presence', 'leave', {
                    key,
                    leftPresences: previous[key],
                  });
              this.emit('presence', 'sync', {});
            }
          } catch {
            socket.close(1008, 'Invalid realtime frame');
          }
        });
        socket.addEventListener('close', () => {
          if (this.stopped || generation !== this.generation) return;
          this.state = 'closed';
          this.subscribed?.('CLOSED');
          if (this.refresh) clearTimeout(this.refresh);
          this.ready = null;
          this.scheduleReconnect();
        });
      });
      if (this.stopped || generation !== this.generation) {
        socket.close();
        return;
      }
      old?.close();
      this.state = 'joined';
      this.attempts = 0;
      if (this.tracked)
        socket.send(JSON.stringify({ type: 'track', payload: this.tracked }));
      this.subscribed?.('SUBSCRIBED');
      if (this.refresh) clearTimeout(this.refresh);
      this.refresh = setTimeout(() => {
        void this.refreshTicket();
      }, 45000);
    } catch (error) {
      if (this.stopped || generation !== this.generation) return;
      this.socket?.close();
      this.state = 'closed';
      this.ready = null;
      this.subscribed?.(
        'CHANNEL_ERROR',
        error instanceof Error ? error : new Error('Realtime unavailable')
      );
      this.scheduleReconnect();
    }
  }
  private async refreshTicket() {
    const generation = this.generation;
    try {
      const ticket = await this.join();
      if (
        this.stopped ||
        generation !== this.generation ||
        this.socket?.readyState !== WebSocket.OPEN
      )
        return;
      if (new URL(ticket.endpoint).toString() !== this.endpoint)
        throw new Error('Realtime endpoint changed');
      this.socket.send(
        JSON.stringify({ type: 'authenticate', token: ticket.token })
      );
      this.role = ticket.role ?? 'editor';
      this.refresh = setTimeout(() => {
        void this.refreshTicket();
      }, 45000);
    } catch (error) {
      if (this.stopped || generation !== this.generation) return;
      this.subscribed?.(
        'CHANNEL_ERROR',
        error instanceof Error ? error : new Error('Realtime unavailable')
      );
      this.socket?.close();
    }
  }
  private scheduleReconnect() {
    if (this.stopped || this.retry) return;
    this.retry = setTimeout(
      () => {
        this.retry = null;
        this.ready = this.connect();
      },
      Math.min(30000, 500 * 2 ** this.attempts++)
    );
  }
  async send(message: BroadcastMessage) {
    if (this.stopped) this.subscribe();
    await this.ready;
    if (this.role === 'viewer' && message.event !== 'awareness')
      return 'ok' as const;
    const encoded = JSON.stringify(message);
    if (new TextEncoder().encode(encoded).length > CHANNEL_FRAME_BYTES)
      throw new Error('Realtime frame exceeds limit');
    if (this.socket?.readyState !== WebSocket.OPEN)
      throw new Error('Realtime channel disconnected');
    this.socket.send(encoded);
    return 'ok' as const;
  }
  async track(payload: Record<string, unknown>) {
    if (new TextEncoder().encode(JSON.stringify(payload)).length > 16384)
      throw new Error('Presence exceeds limit');
    this.tracked = payload;
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ type: 'track', payload }));
    return 'ok' as const;
  }
  async untrack() {
    this.tracked = null;
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ type: 'untrack' }));
    return 'ok' as const;
  }
  presenceState<T = Record<string, unknown>>(): RealtimePresenceState<T> {
    return this.presence as RealtimePresenceState<T>;
  }
  async unsubscribe() {
    this.stopped = true;
    this.generation++;
    if (this.refresh) clearTimeout(this.refresh);
    if (this.retry) clearTimeout(this.retry);
    this.refresh = this.retry = null;
    this.ready = null;
    this.socket?.close();
    this.socket = null;
    this.presence = {};
    this.state = 'closed';
    return 'ok' as const;
  }
}
