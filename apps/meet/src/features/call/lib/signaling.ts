import type {
  MeetRealtimeClientMessage,
  MeetRealtimeServerMessage,
} from '@tuturuuu/realtime/meet';

type PendingRequest = {
  reject: (error: Error) => void;
  resolve: (result: unknown) => void;
};

export interface MeetSignalingOptions {
  onMessage: (message: MeetRealtimeServerMessage) => void;
  onStatusChange?: (status: MeetSignalingStatus) => void;
  url: string;
}

export type MeetSignalingStatus = 'connecting' | 'open' | 'closed' | 'error';

/**
 * Distributive so each variant of the discriminated union keeps its own fields;
 * a plain `Omit<Union, 'requestId'>` collapses them into their intersection.
 */
type WithoutRequestId<T> = T extends unknown ? Omit<T, 'requestId'> : never;

export type MeetRequestMessage = WithoutRequestId<MeetRealtimeClientMessage>;

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Typed WebSocket wrapper for the meet realtime protocol.
 *
 * Every Cloudflare SFU call is request/response but the transport is a single
 * multiplexed socket, so each request carries a `requestId` the server echoes
 * back on `sfu.response`. Without that correlation two concurrent
 * renegotiations would resolve into each other.
 */
export class MeetSignaling {
  private readonly options: MeetSignalingOptions;
  private readonly pending = new Map<string, PendingRequest>();
  private nextRequestId = 0;
  private socket: WebSocket | null = null;
  private closedByUs = false;

  constructor(options: MeetSignalingOptions) {
    this.options = options;
  }

  connect() {
    this.closedByUs = false;
    this.options.onStatusChange?.('connecting');

    const socket = new WebSocket(this.options.url);
    this.socket = socket;

    socket.addEventListener('open', () =>
      this.options.onStatusChange?.('open')
    );
    socket.addEventListener('error', () =>
      this.options.onStatusChange?.('error')
    );
    socket.addEventListener('close', () => {
      this.failAllPending(new Error('signaling_closed'));
      if (!this.closedByUs) this.options.onStatusChange?.('closed');
    });
    socket.addEventListener('message', (event) => {
      this.handleMessage(String(event.data));
    });
  }

  private handleMessage(raw: string) {
    let message: MeetRealtimeServerMessage;
    try {
      message = JSON.parse(raw) as MeetRealtimeServerMessage;
    } catch {
      return;
    }

    if (message.type === 'sfu.response' && message.requestId) {
      this.pending.get(message.requestId)?.resolve(message.result);
      this.pending.delete(message.requestId);
    }

    if (message.type === 'error' && message.requestId) {
      this.pending.get(message.requestId)?.reject(new Error(message.error));
      this.pending.delete(message.requestId);
    }

    this.options.onMessage(message);
  }

  private failAllPending(error: Error) {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }

  get isOpen() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /** Fire-and-forget for messages the server does not acknowledge. */
  send(message: MeetRealtimeClientMessage) {
    if (!this.isOpen) return;
    this.socket?.send(JSON.stringify(message));
  }

  /** Sends a message and resolves with the matching `sfu.response` result. */
  request<T = unknown>(message: MeetRequestMessage): Promise<T> {
    if (!this.isOpen) {
      return Promise.reject(new Error('signaling_closed'));
    }

    this.nextRequestId += 1;
    const requestId = `req-${this.nextRequestId}`;

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('signaling_timeout'));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(requestId, {
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result as T);
        },
      });

      this.socket?.send(
        JSON.stringify({ ...message, requestId } as MeetRealtimeClientMessage)
      );
    });
  }

  close() {
    this.closedByUs = true;
    this.failAllPending(new Error('signaling_closed'));
    this.socket?.close();
    this.socket = null;
  }
}
