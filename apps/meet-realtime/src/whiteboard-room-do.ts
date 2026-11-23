import { serviceRequestHeaders } from '../../../packages/realtime/src/core/service-request';
import {
  signRealtimePayload,
  verifyRealtimePayload,
} from '../../../packages/realtime/src/core/token';
import { sameBoardSession } from '../../../packages/realtime/src/meet/board-sync-access';
import {
  type BoardRoom,
  createBoardRoom,
} from '../../../packages/realtime/src/meet/board-sync-core';
import { chunkElements } from '../../../packages/realtime/src/meet/board-sync-merge';
import {
  BOARD_LIMITS,
  BOARD_TICKET_AUDIENCE,
  type BoardCheckpointBody,
  type BoardElement,
  type BoardMember,
  type BoardRole,
  type BoardServerMessage,
  type BoardTicket,
  boardCheckpointResultSchema,
  boardClientMessage,
  boardTicketSchema,
} from '../../../packages/realtime/src/meet/board-sync-schema';

export interface WhiteboardRoomEnv {
  WHITEBOARD_ROOM: DurableObjectNamespace;
  MEET_REALTIME_TOKEN_SECRET: string;
  PLATFORM_API_BASE_URL?: string;
  /** Stop fence: `true` or `1` halts storage writes and database flushes. */
  MEET_WHITEBOARD_FLUSH_DISABLED?: string;
}

type Attachment = {
  ticket: BoardTicket;
  connectionId: string;
  windowAt: number;
  messages: number;
};

const CHECKPOINT_PATH = '/api/v1/realtime/whiteboard/checkpoint';

async function sha256(text: string) {
  return Buffer.from(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  ).toString('hex');
}

/**
 * One room per (meeting, board). It relays Excalidraw element changes between
 * participants and hands the merged scene to the platform, which stores it in
 * `workspace_whiteboards.snapshot`. Timing and write budgets live in the pure
 * board room core; this class owns sockets, tickets and the platform calls.
 */
export class WhiteboardRoomDurableObject implements DurableObject {
  private room: BoardRoom;
  private identity: Pick<BoardTicket, 'meetingId' | 'wsId' | 'boardId'> | null =
    null;
  private ready: Promise<void>;
  private alarmInFlight: Promise<void> | null = null;

  constructor(
    private state: DurableObjectState,
    private env: WhiteboardRoomEnv
  ) {
    this.room = createBoardRoom({
      now: () => Date.now(),
      storage: {
        get: (key) => this.state.storage.get(key),
        put: (entries) => this.state.storage.put(entries),
        setAlarm: (at) => this.state.storage.setAlarm(at),
      },
      load: async () => {
        const answer = await this.checkpointCall('GET');
        if (answer.status !== 200 || !answer.result)
          throw new Error('Board load failed');
        return answer.result;
      },
      flush: (body) => this.checkpointCall('POST', body),
      hash: sha256,
      broadcast: (message) => this.broadcast(message),
      connections: () => this.sockets().length,
      closeExpired: () => {
        for (const socket of this.sockets())
          if (this.attachment(socket).ticket.exp * 1000 <= Date.now())
            socket.close(1008, 'Ticket expired');
      },
      closeAll: () => {
        for (const socket of this.sockets()) socket.close(1000, 'Board closed');
      },
      fenceValue: () => this.env.MEET_WHITEBOARD_FLUSH_DISABLED,
    });
    this.ready = state.blockConcurrencyWhile(async () => {
      this.identity =
        (await state.storage.get<NonNullable<typeof this.identity>>(
          'identity'
        )) ?? null;
      await this.room.restore();
    });
  }

  private sockets() {
    return this.state
      .getWebSockets()
      .filter((socket) => socket.readyState === undefined || socket.readyState === 1);
  }

  private attachment(socket: WebSocket) {
    return socket.deserializeAttachment() as Attachment;
  }

  private broadcast(message: BoardServerMessage, except?: WebSocket) {
    const payload = JSON.stringify(message);
    for (const socket of this.sockets()) {
      if (socket === except) continue;
      try {
        socket.send(payload);
      } catch {
        socket.close();
      }
    }
  }

  private members(): BoardMember[] {
    return this.sockets().map((socket) => {
      const { ticket } = this.attachment(socket);
      return {
        id: ticket.userId,
        displayName: ticket.displayName,
        role: ticket.role,
      };
    });
  }

  private platformOrigin() {
    const base = new URL(this.env.PLATFORM_API_BASE_URL ?? 'https://tuturuuu.com');
    if (
      base.protocol !== 'https:' &&
      !['localhost', '127.0.0.1'].includes(base.hostname)
    )
      throw new Error('Invalid checkpoint origin');
    return base;
  }

  /** The platform rechecks link, archive state and workspace on every call. */
  private async checkpointCall(method: 'GET' | 'POST', body?: BoardCheckpointBody) {
    if (!this.identity) throw new Error('Board identity unknown');
    const token = signRealtimePayload(
      {
        aud: BOARD_TICKET_AUDIENCE,
        kind: 'checkpoint',
        ...this.identity,
        actorKind: 'system',
        userId: 'system',
        displayName: 'Checkpoint',
        role: 'edit',
        exp: Math.floor(Date.now() / 1000) + 30,
      } satisfies BoardTicket,
      this.env.MEET_REALTIME_TOKEN_SECRET
    );
    const response = await fetch(new URL(CHECKPOINT_PATH, this.platformOrigin()), {
      method,
      headers: serviceRequestHeaders(token),
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000),
      redirect: 'manual',
    });
    if (response.status !== 200 && response.status !== 409)
      return { status: response.status };
    const parsed = boardCheckpointResultSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('Invalid checkpoint answer');
    return { status: response.status, result: parsed.data };
  }

  async fetch(request: Request) {
    await this.ready;
    const ticket = boardTicketSchema.safeParse(
      JSON.parse(request.headers.get('x-board-ticket') ?? 'null')
    );
    if (!ticket.success || ticket.data.exp * 1000 <= Date.now())
      return new Response('Unauthorized', { status: 401 });
    if (request.headers.get('Upgrade') !== 'websocket')
      return new Response(null, { status: 426 });
    const { meetingId, wsId, boardId } = ticket.data;
    if (
      this.identity &&
      !sameBoardSession(
        { ...this.identity, userId: 'x' },
        { meetingId, wsId, boardId, userId: 'x' }
      )
    )
      return new Response(null, { status: 403 });
    if (this.sockets().length >= BOARD_LIMITS.maxSockets)
      return new Response('Room full', { status: 429 });
    if (!this.identity) {
      this.identity = { meetingId, wsId, boardId };
      await this.state.storage.put({ identity: this.identity });
    }
    try {
      await this.room.ensureLoaded();
    } catch {
      return new Response(null, { status: 503 });
    }
    if (this.room.closed) return new Response(null, { status: 410 });
    const pair = new WebSocketPair();
    pair[1].serializeAttachment({
      ticket: ticket.data,
      connectionId: crypto.randomUUID(),
      windowAt: Date.now(),
      messages: 0,
    } satisfies Attachment);
    this.state.acceptWebSocket(pair[1]);
    this.sendScene(pair[1], ticket.data.role);
    this.broadcast({ type: 'presence', members: this.members() });
    await this.room.connectionsChanged();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private sendScene(socket: WebSocket, role: BoardRole) {
    const chunks = chunkElements(this.room.elements() as BoardElement[]);
    chunks.forEach((elements, chunk) =>
      socket.send(
        JSON.stringify({
          type: 'sync',
          elements,
          chunk,
          chunks: chunks.length,
          role,
        } satisfies BoardServerMessage)
      )
    );
  }

  async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer) {
    await this.ready;
    const attachment = this.attachment(socket);
    if (attachment.ticket.exp * 1000 <= Date.now())
      return socket.close(1008, 'Ticket expired');
    if (
      typeof data !== 'string' ||
      new TextEncoder().encode(data).length > BOARD_LIMITS.maxMessageBytes
    )
      return socket.close(1009, 'Message exceeds limit');
    if (Date.now() - attachment.windowAt >= 1000) {
      attachment.windowAt = Date.now();
      attachment.messages = 0;
    }
    if (++attachment.messages > BOARD_LIMITS.messageRate)
      return socket.close(1008, 'Message rate exceeded');
    socket.serializeAttachment(attachment);
    let message: ReturnType<typeof boardClientMessage.parse>;
    try {
      message = boardClientMessage.parse(JSON.parse(data));
    } catch {
      return socket.close(1008, 'Invalid whiteboard message');
    }
    const { ticket } = attachment;
    switch (message.type) {
      case 'authenticate': {
        const next = boardTicketSchema.safeParse(
          verifyRealtimePayload(message.token, this.env.MEET_REALTIME_TOKEN_SECRET)
        );
        if (
          !next.success ||
          next.data.kind !== 'join' ||
          next.data.exp * 1000 <= Date.now() ||
          !sameBoardSession(ticket, next.data)
        )
          return socket.close(1008, 'Invalid refresh');
        attachment.ticket = next.data;
        socket.serializeAttachment(attachment);
        if (next.data.role !== ticket.role) {
          socket.send(JSON.stringify({ type: 'role', role: next.data.role }));
          this.broadcast({ type: 'presence', members: this.members() });
        }
        return;
      }
      case 'sync':
        return this.sendScene(socket, ticket.role);
      case 'cursor':
        return this.broadcast(
          {
            type: 'cursor',
            senderId: ticket.userId,
            displayName: ticket.displayName,
            x: message.x,
            y: message.y,
            tool: message.tool,
          },
          socket
        );
      case 'selection':
        return this.broadcast(
          {
            type: 'selection',
            senderId: ticket.userId,
            selectedElementIds: message.selectedElementIds,
            timestamp: Date.now(),
          },
          socket
        );
      case 'elements': {
        if (ticket.role !== 'edit') return socket.close(1008, 'Read-only board');
        const applied = await this.room.edit(message.changes);
        if (applied.length > 0)
          this.broadcast(
            {
              type: 'elements',
              senderId: ticket.userId,
              changes: applied,
              timestamp: Date.now(),
            },
            socket
          );
      }
    }
  }

  async webSocketClose() {
    this.broadcast({ type: 'presence', members: this.members() });
    await this.room.connectionsChanged();
  }

  async webSocketError(socket: WebSocket) {
    socket.close();
    await this.webSocketClose();
  }

  alarm() {
    this.alarmInFlight ??= this.ready
      .then(() => this.room.alarm())
      .finally(() => {
        this.alarmInFlight = null;
      });
    return this.alarmInFlight;
  }
}
