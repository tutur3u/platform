import {
  admitOrHold,
  applyMeetRoomCommand,
  CloudflareSfuClient,
  canMeetRealtimeManageParticipants,
  createMeetRoomSnapshot,
  type MeetRealtimeServerMessage,
  type MeetRealtimeTokenPayload,
  type MeetRoomSnapshot,
  type MeetSfuIntent,
  meetAdmissionPendingMessage,
  meetPresenceMessage,
  meetRealtimeClientMessageSchema,
  pruneMeetPresence,
  releaseParticipant,
  remoteMeetTracks,
} from '../../../packages/realtime/src/meet';

/**
 * One Durable Object per meeting room.
 *
 * The Bun server in `server.ts` keeps room state in a module-level Map, which
 * is only correct for a single replica. A Durable Object gives every room a
 * single authoritative home, which is what makes horizontal scaling safe and is
 * the same model `cloudflare/meet` uses.
 */

export interface MeetRoomEnv {
  CLOUDFLARE_REALTIME_API_BASE_URL?: string;
  CLOUDFLARE_REALTIME_APP_ID: string;
  CLOUDFLARE_REALTIME_APP_SECRET: string;
  MEET_REALTIME_TOKEN_SECRET: string;
  MEET_ROOM: DurableObjectNamespace;
}

const SNAPSHOT_KEY = 'snapshot';
const PRESENCE_SWEEP_MS = 10_000;

type SocketAttachment = {
  token: MeetRealtimeTokenPayload;
};

export class MeetRoomDurableObject implements DurableObject {
  private readonly env: MeetRoomEnv;
  private readonly state: DurableObjectState;
  private snapshot: MeetRoomSnapshot = createMeetRoomSnapshot();
  private loaded = false;

  constructor(state: DurableObjectState, env: MeetRoomEnv) {
    this.env = env;
    this.state = state;
  }

  private async load() {
    if (this.loaded) return;
    const stored = await this.state.storage.get<MeetRoomSnapshot>(SNAPSHOT_KEY);
    if (stored) this.snapshot = stored;
    this.loaded = true;
  }

  private persist() {
    // Fire-and-forget: the in-memory snapshot is authoritative while the object
    // is alive, and storage only has to survive eviction.
    void this.state.storage.put(SNAPSHOT_KEY, this.snapshot);
  }

  private sockets() {
    return this.state.getWebSockets();
  }

  private tokenOf(socket: WebSocket): MeetRealtimeTokenPayload | null {
    const attachment = socket.deserializeAttachment() as
      | SocketAttachment
      | null
      | undefined;
    return attachment?.token ?? null;
  }

  private sendTo(socket: WebSocket, message: MeetRealtimeServerMessage) {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      // A closing socket is not an error worth surfacing to the room.
    }
  }

  private broadcast(messages: MeetRealtimeServerMessage[]) {
    if (!messages.length) return;
    for (const socket of this.sockets()) {
      for (const message of messages) this.sendTo(socket, message);
    }
  }

  private sendToUser(userId: string, messages: MeetRealtimeServerMessage[]) {
    if (!messages.length) return;
    for (const socket of this.sockets()) {
      if (this.tokenOf(socket)?.userId !== userId) continue;
      for (const message of messages) this.sendTo(socket, message);
    }
  }

  private sendToManagers(messages: MeetRealtimeServerMessage[]) {
    if (!messages.length) return;
    for (const socket of this.sockets()) {
      const token = this.tokenOf(socket);
      if (!token || !canMeetRealtimeManageParticipants(token)) continue;
      for (const message of messages) this.sendTo(socket, message);
    }
  }

  private disconnect(userIds: string[]) {
    if (!userIds.length) return;
    const targets = new Set(userIds);
    for (const socket of this.sockets()) {
      const token = this.tokenOf(socket);
      if (token && targets.has(token.userId)) {
        socket.close(4403, 'removed_from_room');
      }
    }
  }

  private sfuClient() {
    return new CloudflareSfuClient({
      apiBaseUrl: this.env.CLOUDFLARE_REALTIME_API_BASE_URL,
      appId: this.env.CLOUDFLARE_REALTIME_APP_ID,
      appSecret: this.env.CLOUDFLARE_REALTIME_APP_SECRET,
    });
  }

  private async runSfuIntent(intent: MeetSfuIntent) {
    const client = this.sfuClient();
    const { message } = intent;

    if (message.type === 'sfu.session.create') {
      return client.createSession(message.sessionDescription);
    }
    if (
      message.type === 'sfu.tracks.publish' ||
      message.type === 'sfu.tracks.subscribe'
    ) {
      return client.addTracks(message);
    }
    if (message.type === 'sfu.renegotiate') {
      return client.renegotiate(message);
    }
    return client.closeTracks(message);
  }

  async fetch(request: Request): Promise<Response> {
    await this.load();

    const rawToken = request.headers.get('x-meet-token');
    if (!rawToken) {
      return new Response('Unauthorized', { status: 401 });
    }

    let token: MeetRealtimeTokenPayload;
    try {
      token = JSON.parse(rawToken) as MeetRealtimeTokenPayload;
    } catch {
      return new Response('Unauthorized', { status: 401 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    server.serializeAttachment({ token } satisfies SocketAttachment);
    this.state.acceptWebSocket(server);

    const outcome = admitOrHold(this.snapshot, token, new Date().toISOString());
    this.snapshot = outcome.state;
    this.persist();

    for (const message of outcome.reply) this.sendTo(server, message);
    this.broadcast(outcome.broadcast);
    this.sendToManagers(outcome.toManagers);

    // A newly admitted participant needs the tracks published before they
    // arrived, otherwise they would only ever see people who join after them.
    if (!this.snapshot.waiting[token.userId]) {
      this.sendTo(server, meetPresenceMessage(this.snapshot, token.roomId));
      for (const track of remoteMeetTracks(this.snapshot, token.userId)) {
        this.sendTo(server, {
          sessionId: track.sessionId,
          tracks: [track],
          type: 'track.published',
          userId: track.userId,
        });
      }
    }

    void this.scheduleSweep();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    await this.load();

    const token = this.tokenOf(socket);
    if (!token) {
      this.sendTo(socket, { error: 'unauthenticated', type: 'error' });
      return;
    }

    let json: unknown;
    try {
      json = JSON.parse(
        typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
      );
    } catch {
      this.sendTo(socket, { error: 'malformed_json', type: 'error' });
      return;
    }

    const parsed = meetRealtimeClientMessageSchema.safeParse(json);
    if (!parsed.success) {
      this.sendTo(socket, { error: 'malformed_event', type: 'error' });
      return;
    }

    const outcome = applyMeetRoomCommand(this.snapshot, {
      message: parsed.data,
      now: new Date().toISOString(),
      token,
    });

    this.snapshot = outcome.state;
    this.persist();

    for (const message of outcome.reply) this.sendTo(socket, message);
    this.broadcast(outcome.broadcast);
    this.sendToManagers(outcome.toManagers);
    for (const entry of outcome.direct) {
      this.sendToUser(entry.userId, [entry.message]);
    }

    if (outcome.sfu) {
      try {
        const result = await this.runSfuIntent(outcome.sfu);
        this.sendTo(socket, {
          action: outcome.sfu.message.type,
          requestId: outcome.sfu.requestId,
          result,
          type: 'sfu.response',
        });
      } catch (error) {
        this.sendTo(socket, {
          error: error instanceof Error ? error.message : 'sfu_request_failed',
          requestId: outcome.sfu.requestId,
          type: 'error',
        });
      }
    }

    this.disconnect(outcome.disconnect);
  }

  async webSocketClose(socket: WebSocket) {
    await this.releaseSocket(socket);
  }

  async webSocketError(socket: WebSocket) {
    await this.releaseSocket(socket);
  }

  private async releaseSocket(socket: WebSocket) {
    await this.load();
    const token = this.tokenOf(socket);
    if (!token) return;

    // Only drop presence once the participant has no socket left, so a page
    // with two tabs does not remove itself from the room.
    const stillConnected = this.sockets().some(
      (candidate) =>
        candidate !== socket && this.tokenOf(candidate)?.userId === token.userId
    );
    if (stillConnected) return;

    const outcome = releaseParticipant(
      this.snapshot,
      token.userId,
      token.roomId
    );
    this.snapshot = outcome.state;
    this.persist();
    this.broadcast(outcome.broadcast);
    this.sendToManagers(outcome.toManagers);
  }

  private async scheduleSweep() {
    const existing = await this.state.storage.getAlarm();
    if (existing === null) {
      await this.state.storage.setAlarm(Date.now() + PRESENCE_SWEEP_MS);
    }
  }

  async alarm() {
    await this.load();

    const pruned = pruneMeetPresence(this.snapshot, Date.now());
    if (pruned !== this.snapshot) {
      this.snapshot = pruned;
      this.persist();
    }

    const sockets = this.sockets();
    if (sockets.length === 0) return;

    const roomId = this.tokenOf(sockets[0] as WebSocket)?.roomId;
    if (roomId) {
      this.broadcast([meetPresenceMessage(this.snapshot, roomId)]);
    }
    this.sendToManagers([meetAdmissionPendingMessage(this.snapshot)]);

    await this.state.storage.setAlarm(Date.now() + PRESENCE_SWEEP_MS);
  }
}
