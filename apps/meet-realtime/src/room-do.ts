import {
  admitOrHold,
  CloudflareSfuClient,
  canMeetRealtimeManageParticipants,
  canReadRoomNotes,
  createMeetRoomSnapshot,
  MeetCommandExecutor,
  type MeetRealtimeServerMessage,
  type MeetRealtimeTokenPayload,
  type MeetRoomOutcome,
  type MeetRoomSnapshot,
  type MeetSfuIntent,
  meetAdmissionPendingMessage,
  meetPresenceMessage,
  meetRealtimeClientMessageSchema,
  pruneMeetPresence,
  releaseParticipant,
  remoteMeetTracks,
} from '../../../packages/realtime/src/meet';
import { parseMeetRoomSettingsPatch } from '../../../packages/realtime/src/meet/room-options';

import { getSessionIceServers, type TurnEnv } from './turn-credentials';

/**
 * One Durable Object per meeting room.
 *
 * The Bun server in `server.ts` keeps room state in a module-level Map, which
 * is only correct for a single replica. A Durable Object gives every room a
 * single authoritative home, which is what makes horizontal scaling safe and is
 * the same model `cloudflare/meet` uses.
 */

export interface MeetRoomEnv extends TurnEnv {
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
  private commands = new MeetCommandExecutor();

  constructor(state: DurableObjectState, env: MeetRoomEnv) {
    this.env = env;
    this.state = state;
  }

  private async load() {
    if (this.loaded) return;
    const stored = await this.state.storage.get<MeetRoomSnapshot>(SNAPSHOT_KEY);
    if (stored) this.snapshot = { ...createMeetRoomSnapshot(), ...stored };
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
      const [session, iceServers] = await Promise.all([
        client.createSession(message.sessionDescription),
        getSessionIceServers(this.env),
      ]);
      return { ...session, iceServers };
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

    if (new URL(request.url).pathname === '/room-state') {
      if (request.method === 'PATCH') {
        if (token.role !== 'host')
          return new Response('Forbidden', { status: 403 });
        const body = await request.json().catch(() => null);
        const patch = parseMeetRoomSettingsPatch(body, this.snapshot.settings);
        if (!patch.success)
          return new Response('Invalid settings', { status: 400 });
        const settings = patch.data;
        this.snapshot = { ...this.snapshot, settings };
        this.persist();
        this.broadcast([{ type: 'room.settings', settings }]);
      }
      return Response.json(
        {
          canReadNotes: canReadRoomNotes(this.snapshot, token),
          ended: !!this.snapshot.ended,
          ...(token.role === 'host'
            ? { settings: this.snapshot.settings ?? { shareNotes: false } }
            : {}),
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
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
    if (!this.snapshot.ended && !this.snapshot.waiting[token.userId]) {
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

    this.disconnect(outcome.disconnect);
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

    await this.commands.run(
      { message: parsed.data, now: new Date().toISOString(), token },
      {
        read: () => this.snapshot,
        commit: (result) => this.flush(socket, result),
        runSfu: (intent) => this.runSfuIntent(intent),
      }
    );
  }

  private flush(socket: WebSocket, result: MeetRoomOutcome) {
    this.snapshot = result.state;
    this.persist();
    for (const message of result.reply) this.sendTo(socket, message);
    this.broadcast(result.broadcast);
    this.sendToManagers(result.toManagers);
    for (const entry of result.direct)
      this.sendToUser(entry.userId, [entry.message]);
    this.disconnect(result.disconnect);
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

    const sockets = this.sockets();
    const connectedUserIds = new Set(
      sockets
        .filter((socket) => socket.readyState === WebSocket.OPEN)
        .map((socket) => this.tokenOf(socket)?.userId)
        .filter((userId): userId is string => Boolean(userId))
    );
    const pruned = pruneMeetPresence(
      this.snapshot,
      Date.now(),
      connectedUserIds
    );
    if (pruned !== this.snapshot) {
      const expired = Object.keys(this.snapshot.presence).filter(
        (userId) => !pruned.presence[userId]
      );
      this.snapshot = pruned;
      for (const userId of expired) {
        const token = sockets
          .map((socket) => this.tokenOf(socket))
          .find((candidate) => candidate?.userId === userId);
        const firstSocket = sockets[0];
        const roomId =
          token?.roomId ??
          (firstSocket ? this.tokenOf(firstSocket)?.roomId : undefined);
        const outcome = releaseParticipant(this.snapshot, userId, roomId ?? '');
        this.snapshot = outcome.state;
        this.broadcast(outcome.broadcast);
        for (const socket of sockets) {
          if (
            this.tokenOf(socket)?.userId === userId &&
            socket.readyState === WebSocket.OPEN
          ) {
            socket.close(4000, 'heartbeat_timeout');
          }
        }
      }
      this.persist();
    }

    if (sockets.length === 0) return;

    const roomId = this.tokenOf(sockets[0] as WebSocket)?.roomId;
    if (roomId) {
      this.broadcast([meetPresenceMessage(this.snapshot, roomId)]);
    }
    this.sendToManagers([meetAdmissionPendingMessage(this.snapshot)]);

    await this.state.storage.setAlarm(Date.now() + PRESENCE_SWEEP_MS);
  }
}
