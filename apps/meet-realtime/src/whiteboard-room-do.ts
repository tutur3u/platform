import { serviceRequestHeaders } from '../../../packages/realtime/src/core/service-request';
import {
  signRealtimePayload,
  verifyRealtimePayload,
} from '../../../packages/realtime/src/core/token';
import {
  boardTicketRole,
  isGuestBoardDrawEnabled,
  isTerminalCheckpointStatus,
  sameBoardSession,
} from '../../../packages/realtime/src/meet/board-sync-access';
import { boardActorId } from '../../../packages/realtime/src/meet/board-sync-actor';
import {
  BoardLoadError,
  type BoardRoom,
  createBoardRoom,
} from '../../../packages/realtime/src/meet/board-sync-core';
import { chunkElements } from '../../../packages/realtime/src/meet/board-sync-merge';
import { boardFlushFenced } from '../../../packages/realtime/src/meet/board-sync-flush';
import {
  type BoardOpenWindows,
  type ChurnBucket,
  chargeBoardOpen,
  refillChurnBudget,
  refillRoomChurnBudget,
  sanitizeGuestChanges,
} from '../../../packages/realtime/src/meet/board-sync-guest';
import {
  BOARD_GUEST_LIMITS,
  BOARD_LIMITS,
  BOARD_SOCKET_PROTOCOL,
  BOARD_SYNC_INTERVAL_MS,
  BOARD_TICKET_AUDIENCE,
  type BoardCheckpointBody,
  type BoardElement,
  type BoardMember,
  type BoardRole,
  type BoardServerMessage,
  type BoardTicket,
  boardChangeSchema,
  boardCheckpointResultSchema,
  boardClientMessage,
  boardSocketBudget,
  boardTicketSchema,
} from '../../../packages/realtime/src/meet/board-sync-schema';

export interface WhiteboardRoomEnv {
  WHITEBOARD_ROOM: DurableObjectNamespace;
  MEET_REALTIME_TOKEN_SECRET: string;
  PLATFORM_API_BASE_URL?: string;
  /** Stop fence: `true` or `1` halts storage writes and database flushes. */
  MEET_WHITEBOARD_FLUSH_DISABLED?: string;
  /**
   * Guest drawing: only the exact string `true` lets a guest ticket write.
   * Missing or any other value keeps every guest view-only.
   */
  MEET_GUEST_WHITEBOARD_DRAW?: string;
}

type Attachment = {
  ticket: BoardTicket;
  connectionId: string;
  /** The person's per-board id (`boardActorId`); others never see user ids. */
  actorId?: string;
  windowAt: number;
  messages: number;
  /** When this socket last asked for the scene; resends are throttled. */
  lastSyncAt: number;
  /**
   * A guest connection's churn bucket (`refillChurnBudget`). It rides in the
   * attachment, so it survives hibernation and eviction without a storage
   * write; a new connection starts full, which the persisted open limit
   * bounds to six a minute per guest.
   */
  tokens?: number;
  tokensAt?: number;
};

const CHECKPOINT_PATH = '/api/v1/realtime/whiteboard/checkpoint';
const OPENS_KEY = 'guest-opens';

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
  private identityStored = false;
  /**
   * Guest socket opens per person this minute. Stored under `OPENS_KEY`, so
   * an eviction does not reset the limit; `chargeBoardOpen` bounds its size.
   */
  private opens: BoardOpenWindows = new Map();
  /**
   * The board's shared guest churn bucket (`refillRoomChurnBudget`), held in
   * memory, so it costs no storage write. An eviction restarts it full,
   * which grants nothing extra: a hibernating object is evicted only after
   * about ten seconds without an event, and the bucket refills from empty in
   * ten seconds anyway. A runtime restart grants at most one extra bucket.
   * Each connection's own bucket survives either in its attachment.
   */
  private roomChurn: ChurnBucket = {};

  constructor(
    private state: DurableObjectState,
    private env: WhiteboardRoomEnv
  ) {
    this.room = createBoardRoom({
      now: () => Date.now(),
      storage: {
        get: (key) => this.state.storage.get(key),
        put: (entries) => this.state.storage.put(entries),
        delete: async (keys) => {
          await this.state.storage.delete(keys);
        },
        setAlarm: (at) => this.state.storage.setAlarm(at),
      },
      load: () => this.checkpointCall({ op: 'load' }),
      flush: (body) => this.checkpointCall(body),
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
      this.identityStored = this.identity !== null;
      this.opens = new Map(
        Object.entries(
          (await state.storage.get<
            Record<string, { count: number; windowAt: number }>
          >(OPENS_KEY)) ?? {}
        )
      );
      await this.room.restore();
    });
  }

  private sockets() {
    return this.state
      .getWebSockets()
      .filter(
        (socket) => socket.readyState === undefined || socket.readyState === 1
      );
  }

  private attachment(socket: WebSocket) {
    return socket.deserializeAttachment() as Attachment;
  }

  /**
   * The ticket as this room honours it: a guest's role is capped at view
   * while guest drawing is held here, whatever the Meet API signed.
   */
  private honoured(ticket: BoardTicket): BoardTicket {
    return {
      ...ticket,
      role: boardTicketRole(
        ticket,
        isGuestBoardDrawEnabled(this.env.MEET_GUEST_WHITEBOARD_DRAW)
      ),
    };
  }

  private broadcast(message: BoardServerMessage, except?: WebSocket) {
    const payload = JSON.stringify(message);
    for (const socket of this.sockets()) {
      if (socket === except) continue;
      // A socket past its ticket receives nothing, even before a sweep runs.
      if (this.attachment(socket).ticket.exp * 1000 <= Date.now()) {
        socket.close(1008, 'Ticket expired');
        continue;
      }
      try {
        socket.send(payload);
      } catch {
        socket.close();
      }
    }
  }

  /** How others on the board name this socket's person. */
  private actorOf(attachment: Attachment) {
    return attachment.actorId ?? attachment.connectionId;
  }

  private members(): BoardMember[] {
    return this.sockets().map((socket) => {
      const attachment = this.attachment(socket);
      return {
        id: this.actorOf(attachment),
        displayName: attachment.ticket.displayName,
        role: this.honoured(attachment.ticket).role,
      };
    });
  }

  private platformOrigin() {
    const base = new URL(
      this.env.PLATFORM_API_BASE_URL ?? 'https://tuturuuu.com'
    );
    if (
      base.protocol !== 'https:' &&
      !['localhost', '127.0.0.1'].includes(base.hostname)
    )
      throw new Error('Invalid checkpoint origin');
    return base;
  }

  /** The platform rechecks link, archive state and workspace on every call. */
  private async checkpointCall(body: BoardCheckpointBody | { op: 'load' }) {
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
    const response = await fetch(
      new URL(CHECKPOINT_PATH, this.platformOrigin()),
      {
        method: 'POST',
        headers: serviceRequestHeaders(token),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
        redirect: 'manual',
      }
    );
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
    const joined = this.honoured(ticket.data);
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
    const budget = boardSocketBudget(ticket.data.actorKind);
    const held = this.sockets().map((socket) => this.attachment(socket).ticket);
    if (
      held.filter((other) => other.userId === ticket.data.userId).length >=
      budget.socketsPerUser
    )
      return new Response('Too many connections', { status: 429 });
    if (ticket.data.actorKind === 'guest') {
      // Guests never take the last member seats, and each guest may reopen
      // only a few times a minute: every open sends the whole scene.
      if (
        held.filter((other) => other.actorKind === 'guest').length >=
        BOARD_GUEST_LIMITS.maxSockets
      )
        return new Response('Room full', { status: 429 });
      if (
        !chargeBoardOpen(
          this.opens,
          ticket.data.userId,
          budget.opensPerMinute,
          Date.now()
        )
      )
        return new Response('Too many connections', { status: 429 });
      // The stop fence keeps every storage write off.
      if (!boardFlushFenced(this.env.MEET_WHITEBOARD_FLUSH_DISABLED))
        await this.state.storage.put({
          [OPENS_KEY]: Object.fromEntries(this.opens),
        });
    }
    this.identity ??= { meetingId, wsId, boardId };
    // The fence keeps every storage write off; the identity is stored on the
    // first join after it lifts, which a flush after eviction needs.
    if (
      !this.identityStored &&
      !boardFlushFenced(this.env.MEET_WHITEBOARD_FLUSH_DISABLED)
    ) {
      await this.state.storage.put({ identity: this.identity });
      this.identityStored = true;
    }
    try {
      await this.room.prepare();
    } catch (error) {
      return new Response(null, {
        status:
          error instanceof BoardLoadError &&
          isTerminalCheckpointStatus(error.status)
            ? error.status
            : 503,
      });
    }
    if (this.room.closed) return new Response(null, { status: 410 });
    const pair = new WebSocketPair();
    pair[1].serializeAttachment({
      ticket: joined,
      connectionId: crypto.randomUUID(),
      actorId: boardActorId(
        this.env.MEET_REALTIME_TOKEN_SECRET,
        boardId,
        ticket.data.userId
      ),
      windowAt: Date.now(),
      messages: 0,
      lastSyncAt: 0,
    } satisfies Attachment);
    this.state.acceptWebSocket(pair[1]);
    this.sendScene(pair[1], joined.role);
    this.broadcast({ type: 'presence', members: this.members() });
    await this.room.connectionsChanged();
    return new Response(null, {
      status: 101,
      webSocket: pair[0],
      headers: { 'Sec-WebSocket-Protocol': BOARD_SOCKET_PROTOCOL },
    });
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
    const budget = boardSocketBudget(attachment.ticket.actorKind);
    if (
      typeof data !== 'string' ||
      new TextEncoder().encode(data).length > budget.maxMessageBytes
    )
      return socket.close(1009, 'Message exceeds limit');
    if (Date.now() - attachment.windowAt >= 1000) {
      attachment.windowAt = Date.now();
      attachment.messages = 0;
    }
    if (++attachment.messages > budget.messageRate)
      return socket.close(1008, 'Message rate exceeded');
    socket.serializeAttachment(attachment);
    let message: ReturnType<typeof boardClientMessage.parse>;
    let unsupported = 0;
    try {
      const raw = JSON.parse(data);
      // Elements the room cannot hold (images, embeds) are dropped with a
      // notice; closing the socket would only make the client reconnect.
      if (
        raw?.type === 'elements' &&
        Array.isArray(raw.changes) &&
        raw.changes.length <= BOARD_LIMITS.maxChangesPerMessage
      ) {
        const kept = raw.changes.filter(
          (change: unknown) => boardChangeSchema.safeParse(change).success
        );
        unsupported = raw.changes.length - kept.length;
        raw.changes = kept;
        if (kept.length === 0 && unsupported > 0) {
          socket.send(
            JSON.stringify({
              type: 'rejected',
              reason: 'unsupported',
            } satisfies BoardServerMessage)
          );
          return;
        }
      }
      message = boardClientMessage.parse(raw);
    } catch {
      return socket.close(1008, 'Invalid whiteboard message');
    }
    const { ticket } = attachment;
    switch (message.type) {
      case 'authenticate': {
        const next = boardTicketSchema.safeParse(
          verifyRealtimePayload(
            message.token,
            this.env.MEET_REALTIME_TOKEN_SECRET
          )
        );
        if (
          !next.success ||
          next.data.kind !== 'join' ||
          next.data.exp * 1000 <= Date.now() ||
          !sameBoardSession(ticket, next.data)
        )
          return socket.close(1008, 'Invalid refresh');
        // A refresh is capped like a join, so no ticket upgrades a guest.
        const renewed = this.honoured(next.data);
        attachment.ticket = renewed;
        socket.serializeAttachment(attachment);
        if (renewed.role !== ticket.role) {
          socket.send(JSON.stringify({ type: 'role', role: renewed.role }));
          this.broadcast({ type: 'presence', members: this.members() });
        }
        return;
      }
      case 'sync': {
        // A resend can carry the whole scene, so one socket may ask rarely.
        if (Date.now() - attachment.lastSyncAt < BOARD_SYNC_INTERVAL_MS) return;
        attachment.lastSyncAt = Date.now();
        socket.serializeAttachment(attachment);
        return this.sendScene(socket, this.honoured(ticket).role);
      }
      case 'cursor':
        return this.broadcast(
          {
            type: 'cursor',
            senderId: this.actorOf(attachment),
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
            senderId: this.actorOf(attachment),
            selectedElementIds: message.selectedElementIds,
            timestamp: Date.now(),
          },
          socket
        );
      case 'elements': {
        // Rechecked at write time, so a socket accepted before guest drawing
        // was held (its attachment survives hibernation) cannot write either.
        if (this.honoured(ticket).role !== 'edit')
          return socket.close(1008, 'Read-only board');
        // People outside the workspace store only well-typed known fields and
        // safe links; an element that fails is refused like an image is.
        const guest =
          ticket.actorKind === 'guest'
            ? sanitizeGuestChanges(message.changes)
            : null;
        // Guests are held to the scene's render cost and canvas area, and to
        // their connection's and the board's churn buckets, which every
        // applied change spends, re-sent copies included.
        const now = Date.now();
        const own = guest ? refillChurnBudget(attachment, now) : 0;
        const shared = guest ? refillRoomChurnBudget(this.roomChurn, now) : 0;
        const budget = guest ? { tokens: Math.min(own, shared) } : undefined;
        const start = budget?.tokens ?? 0;
        const { applied, rejected } = await this.room.edit(
          guest?.changes ?? message.changes,
          budget
            ? {
                maxCost: BOARD_GUEST_LIMITS.maxSceneCost,
                maxArea: BOARD_GUEST_LIMITS.maxSceneCanvasPixels,
                budget,
              }
            : {}
        );
        if (budget) {
          const spent = start - budget.tokens;
          attachment.tokens = own - spent;
          attachment.tokensAt = now;
          // Charged against the current level: another socket's batch may
          // have spent from it while this one was applied.
          this.roomChurn = {
            tokens: refillRoomChurnBudget(this.roomChurn, now) - spent,
            tokensAt: now,
          };
          socket.serializeAttachment(attachment);
        }
        const refused = unsupported + (guest?.dropped ?? 0);
        const refusal = rejected ?? (refused > 0 ? 'unsupported' : null);
        if (refusal)
          socket.send(
            JSON.stringify({
              type: 'rejected',
              reason: refusal,
            } satisfies BoardServerMessage)
          );
        if (applied.length > 0)
          this.broadcast(
            {
              type: 'elements',
              senderId: this.actorOf(attachment),
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
