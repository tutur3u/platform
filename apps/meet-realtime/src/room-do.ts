import {
  accountRoomTime,
  admitOrHold,
  applyMeetRoomSettings,
  MeetPresencePublisher,
  canCloseMeetSubscriptions,
  recordMeetSubscriptionOperation,
  CloudflareSfuClient,
  createMeetRoomSocketDelivery,
  type MeetRoomSocketAttachment,
  meetClassFeatures,
  meetRoomStateView,
  createMeetRoomSnapshot,
  expireRoomBudget,
  MeetCommandExecutor,
  type MeetRealtimeTokenPayload,
  type MeetRoomOutcome,
  meetRealtimeClientMessageSchema,
  pruneMeetPresence,
  releaseParticipant,
  remoteMeetTracks,
} from '../../../packages/realtime/src/meet';
import { isMeetMessageWithinLimit } from '../../../packages/realtime/src/meet/message-size';
import {
  emptyRoomDeadline,
  expireEmptyRoom,
  observeRoomConnections,
} from '../../../packages/realtime/src/meet/room-lifecycle';
import type { MeetRoomFormsEnv } from '../../../packages/realtime/src/meet/room-forms';
import {
  expireRoomLive,
  liveRoomAnnouncements,
} from '../../../packages/realtime/src/meet/room-live';
import {
  resolveRoomSettingsPatch,
  roomCommand,
} from '../../../packages/realtime/src/meet/room-settings-gate';
import { createRoomUsage } from '../../../packages/realtime/src/meet/room-usage';
import { normalizeTranscriptionConsent } from '../../../packages/realtime/src/meet/transcription';
import {
  handleAttendanceDirectoryRequest,
  publishStoredAttendance,
} from './attendance-directory-request';
import { handleMeetClassServiceRequest } from './room-class-service';
import {
  cleanupRoomPublications,
  countRoomHttpRequest,
  retainRoomAttendance,
  scheduleRoomFollowUps,
  wakeAttendanceCopies,
} from './room-maintenance';
import { handleMeetRoomDevice } from './room-device-request';
import { privateRoomStorage } from './private-room-storage';
import { type RoomServiceState, roomService } from './room-service';
import { runRoomSfuIntent } from './room-sfu-intent';
import type { TurnEnv } from './turn-credentials';
export interface MeetRoomEnv extends TurnEnv, MeetRoomFormsEnv {
  CLOUDFLARE_REALTIME_API_BASE_URL?: string;
  CLOUDFLARE_REALTIME_APP_ID: string;
  CLOUDFLARE_REALTIME_APP_SECRET: string;
  MEET_REALTIME_TOKEN_SECRET: string;
  MEET_ROOM: DurableObjectNamespace;
  /** Server-only Meet AI controls; absent = deny. */
  MEET_AI_ENABLED_WORKSPACE_IDS?: string;
  MEET_AI_ALL_WORKSPACES?: string; // only the reviewed value counts
  MEET_AI_DISABLED?: string;
  MEET_AI_DISABLED_WORKSPACE_IDS?: string;
  MEET_AI_PROTECTED_WORKSPACE_IDS?: string;
}
const SNAPSHOT_KEY = 'snapshot';
const PRESENCE_SWEEP_MS = 10_000;
export class MeetRoomDurableObject implements DurableObject {
  private readonly env: MeetRoomEnv;
  private readonly state: DurableObjectState;
  private snapshot: RoomServiceState = createMeetRoomSnapshot();
  private roomName: string | undefined;
  private snapshotStored = false;
  private loading: Promise<void> | null = null;
  private readonly presence = new MeetPresencePublisher();
  private commands = new MeetCommandExecutor();
  private readonly delivery = createMeetRoomSocketDelivery({
    sockets: () => this.sockets(),
    read: () => this.snapshot,
    fullPresence: (roomId) => this.presence.full(roomId),
    announcements: () => liveRoomAnnouncements(this.snapshot),
  });
  private broadcast = this.delivery.broadcast;

  constructor(state: DurableObjectState, env: MeetRoomEnv) {
    this.env = env;
    this.state = state;
    state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('meet:ping', 'meet:pong')
    );
  }

  private load() {
    this.loading ??= this.state.blockConcurrencyWhile(async () => {
      const stored =
        await this.state.storage.get<RoomServiceState>(SNAPSHOT_KEY);
      if (stored) {
        this.snapshotStored = true;
        this.snapshot = normalizeTranscriptionConsent({
          ...createMeetRoomSnapshot(),
          ...stored,
        });
      }
      this.presence.restore(this.snapshot);
      this.delivery.resyncRestoredSockets();
      const counter = await this.state.storage.get<
        number | { requests: number; writes: number }
      >('usage-http-requests');
      if (counter !== undefined) {
        this.snapshot.usage ??= createRoomUsage();
        this.snapshot.usage.httpRequests = Math.max(
          this.snapshot.usage.httpRequests,
          typeof counter === 'number' ? counter : counter.requests
        );
        this.snapshot.usage.httpCounterWrites = Math.max(
          this.snapshot.usage.httpCounterWrites ?? 0,
          typeof counter === 'number' ? counter : counter.writes
        );
      }
      let migrated =
        stored?.transcriptionConsents !== this.snapshot.transcriptionConsents;
      for (const request of Object.values(this.snapshot.aiRequests ?? {}))
        if (request.status === 'pending' && request.startedAt === undefined) {
          request.startedAt = Date.now();
          migrated = true;
        }
      if (migrated) {
        this.snapshot.usage ??= createRoomUsage();
        this.snapshot.usage.storageWrites++;
        await this.state.storage.put(SNAPSHOT_KEY, this.snapshot);
      }
    });
    return this.loading;
  }

  private persist() {
    if (this.snapshot.usage) this.snapshot.usage.storageWrites++;
    this.snapshotStored = true;
    // Output gating keeps acknowledgements behind the durable write.
    const snapshot = this.snapshot;
    publishStoredAttendance(
      this.env,
      this.state.storage,
      snapshot,
      this.roomName,
      (task) => this.state.waitUntil?.(task)
    );
    return this.presence.persist(
      snapshot,
      () =>
        this.state.storage.put(SNAPSHOT_KEY, {
          ...snapshot,
          chat: snapshot.chat
            ?.filter((message) => message.retained !== false)
            .slice(-500),
        }),
      (create) => {
        const sockets = this.sockets();
        const roomId = sockets[0] && this.delivery.tokenOf(sockets[0])?.roomId;
        if (roomId) this.broadcast([create(roomId)]);
      },
      (task) => this.state.waitUntil?.(task)
    );
  }

  async prepareForRestart() {
    await this.load();
    const seenAt = new Date().toISOString();
    this.snapshot.presence = Object.fromEntries(
      Object.values(this.snapshot.presence).map((person) => [
        person.userId,
        { ...person, lastSeenAt: seenAt },
      ])
    );
    const choices = this.snapshot.miraPrivate?.choices;
    if (choices)
      for (const [accountId, choice] of Object.entries(choices))
        if (choice?.accountId !== accountId) delete choices[accountId];
    await this.persist();
    for (const socket of this.sockets())
      if (socket.readyState === WebSocket.OPEN)
        socket.close(1012, 'service restart');
  }

  private sockets() {
    return this.state.getWebSockets();
  }

  private connectionState(
    excluded?: WebSocket,
    token?: MeetRealtimeTokenPayload
  ) {
    return observeRoomConnections(
      this.snapshot,
      this.delivery.connectedUsers(excluded),
      Date.now(),
      token
    );
  }

  private async scheduleEmptyRoom() {
    const deadline = emptyRoomDeadline(this.snapshot);
    if (deadline !== undefined) await this.scheduleSweep(deadline);
  }

  private sfuClient() {
    return new CloudflareSfuClient({
      apiBaseUrl: this.env.CLOUDFLARE_REALTIME_API_BASE_URL,
      appId: this.env.CLOUDFLARE_REALTIME_APP_ID,
      appSecret: this.env.CLOUDFLARE_REALTIME_APP_SECRET,
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/attendance-index')
      return handleAttendanceDirectoryRequest({
        storage: this.state.storage,
        request,
        secret: this.env.MEET_REALTIME_TOKEN_SECRET,
      });
    await this.load();
    if (url.pathname !== '/class-service' || this.snapshotStored)
      countRoomHttpRequest(this.snapshot, this.state.storage, (task) =>
        this.state.waitUntil?.(task)
      );

    if (url.pathname === '/class-service')
      return handleMeetClassServiceRequest({
        request,
        secret: this.env.MEET_REALTIME_TOKEN_SECRET,
        features: meetClassFeatures(this.env),
        snapshot: this.snapshot,
        now: new Date().toISOString(),
        existed: this.snapshotStored,
        commit: async (snapshot, broadcast) => {
          this.snapshot = snapshot;
          await this.persist();
          if (broadcast.length) this.broadcast(broadcast);
        },
        rememberRoom: (roomId) => {
          this.roomName = roomId;
        },
      });

    const rawToken = request.headers.get('x-meet-token');
    if (!rawToken) return new Response('Unauthorized', { status: 401 });

    let token: MeetRealtimeTokenPayload;
    try {
      token = JSON.parse(rawToken) as MeetRealtimeTokenPayload;
    } catch {
      return new Response('Unauthorized', { status: 401 });
    }
    this.roomName = token.roomId;

    if (url.pathname === '/room-service') {
      const body = await request.json().catch(() => null);
      const owned = await privateRoomStorage(
        this.state.storage,
        this.snapshot,
        token,
        body
      );
      if (owned) return owned;
      const result = roomService(
        this.snapshot,
        token,
        body,
        meetClassFeatures(this.env),
        this.env
      );
      const changed = this.snapshot !== result.state;
      this.snapshot = result.state;
      if (!result.status) {
        if (
          changed &&
          !['live.audio', 'live.share.audio'].includes(
            (body as { action?: string } | null)?.action ?? ''
          )
        )
          await this.persist();
        await this.scheduleEmptyRoom();
        if (this.snapshot.budget?.pendingPublications?.length)
          await this.scheduleSweep(
            this.snapshot.budget.nextCleanupAt ?? Date.now()
          );
        this.broadcast(result.messages ?? []);
        if (
          this.snapshot.liveAssistant &&
          ['live.reserve', 'live.heartbeat'].includes(
            String((body as { action?: string } | null)?.action)
          )
        )
          await this.scheduleSweep(this.snapshot.liveAssistant.expiresAt);
      }
      return Response.json(result.body, {
        status: result.status ?? 200,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    if (url.pathname === '/room-device') {
      const body = (await request.json().catch(() => null)) as {
        mode?: string;
      } | null;
      return handleMeetRoomDevice({
        snapshot: this.snapshot,
        token,
        features: meetClassFeatures(this.env),
        body,
        assign: (snapshot) => void (this.snapshot = snapshot),
        connectionState: () => this.connectionState(),
        persist: () => this.persist(),
        scheduleEmptyRoom: () => this.scheduleEmptyRoom(),
        sendToUser: (userId, messages) =>
          this.delivery.sendToUser(userId, messages),
        broadcast: (messages) => this.broadcast(messages),
        sendToManagers: (messages) => this.delivery.sendToManagers(messages),
        disconnect: (userIds) => this.delivery.disconnect(userIds),
      });
    }
    if (url.pathname === '/room-state') {
      if (request.method === 'PATCH') {
        const settings = resolveRoomSettingsPatch(
          await request.json().catch(() => null),
          this.snapshot.settings,
          token,
          this.env
        );
        if (settings instanceof Response) return settings;
        const updated = applyMeetRoomSettings(
          this.snapshot,
          settings,
          token,
          new Date().toISOString()
        );
        this.snapshot = updated.state;
        await this.persist();
        if (this.snapshot.budget?.pendingPublications?.length)
          await this.scheduleSweep(Date.now());
        this.broadcast(updated.broadcast);
      }
      return Response.json(meetRoomStateView(this.snapshot, token), {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    const previous = this.snapshot.presence[token.userId];
    if (
      previous &&
      Date.now() - Date.parse(previous.lastSeenAt) >= 30_000 &&
      !this.sockets().some(
        (socket) =>
          socket.readyState === WebSocket.OPEN &&
          this.delivery.tokenOf(socket)?.userId === token.userId
      )
    ) {
      const expired = releaseParticipant(
        this.snapshot,
        token.userId,
        token.roomId,
        meetClassFeatures(this.env)
      );
      this.snapshot = expired.state;
      await this.persist();
      this.broadcast(expired.broadcast);
      this.delivery.sendToManagers(expired.toManagers);
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    server.serializeAttachment({
      token,
      supportsPresenceDelta: url.searchParams.get('presenceDelta') === '1',
    } satisfies MeetRoomSocketAttachment);
    this.state.acceptWebSocket(server);

    const outcome = admitOrHold(
      this.snapshot,
      token,
      new Date().toISOString(),
      meetClassFeatures(this.env)
    );
    this.snapshot = outcome.state;
    this.snapshot = this.connectionState(undefined, token);
    if (this.snapshot.budget?.pendingPublications?.length)
      await this.scheduleSweep(Date.now());
    else if (this.snapshot.budget && !this.snapshot.ended)
      await this.scheduleSweep(this.snapshot.budget.expiresAt);
    if (this.snapshot.usage && this.snapshot.presence[token.userId])
      if (Object.keys(this.snapshot.usage.devices).length < 4096)
        this.snapshot.usage.devices[token.userId] = true;
      else if (!this.snapshot.usage.devices[token.userId])
        this.snapshot.usage.limitedReports =
          (this.snapshot.usage.limitedReports ?? 0) + 1;
    await this.persist();

    this.delivery.notifyJoin(server, outcome, this.broadcast);

    // A newly admitted participant needs the tracks published before they
    // arrived, otherwise they would only ever see people who join after them.
    if (!this.snapshot.ended && this.snapshot.presence[token.userId]) {
      this.delivery.sendTo(server, this.presence.full(token.roomId));
      for (const track of remoteMeetTracks(this.snapshot, token.userId)) {
        this.delivery.sendTo(server, {
          sessionId: track.sessionId,
          tracks: [track],
          type: 'track.published',
          userId: track.userId,
        });
      }
    }

    this.delivery.disconnect(outcome.disconnect);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    await this.load();

    const token = this.delivery.tokenOf(socket);
    if (token) this.roomName = token.roomId;
    if (!token) {
      this.delivery.sendTo(socket, { error: 'unauthenticated', type: 'error' });
      return;
    }

    if (!isMeetMessageWithinLimit(raw)) {
      this.delivery.sendTo(socket, {
        error: 'message_too_large',
        type: 'error',
      });
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(
        typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
      );
    } catch {
      this.delivery.sendTo(socket, { error: 'malformed_json', type: 'error' });
      return;
    }

    this.snapshot.usage ??= createRoomUsage();
    this.snapshot.usage.webSocketMessages++;
    const parsed = meetRealtimeClientMessageSchema.safeParse(json);
    if (!parsed.success) {
      this.delivery.sendTo(socket, { error: 'malformed_event', type: 'error' });
      return;
    }

    const admitted = this.snapshot.presence[token.userId];
    const message = parsed.data;
    if (
      message.type === 'presence.resync' &&
      admitted &&
      !this.snapshot.ended
    ) {
      this.delivery.sendTo(socket, this.presence.full(token.roomId));
      return;
    }
    await this.commands.run(
      {
        ...roomCommand(message, token, this.env),
        requireAdmission: true,
        canCloseSubscriptions: () =>
          message.type === 'sfu.tracks.close' &&
          canCloseMeetSubscriptions(
            this.delivery.attachmentOf(socket)?.sessions,
            message
          ),
      },
      {
        read: () => this.snapshot,
        commit: (result) => {
          recordMeetSubscriptionOperation(
            socket,
            this.delivery.attachmentOf(socket),
            message,
            result.reply
          );
          return this.flush(socket, result);
        },
        runSfu: (intent) =>
          runRoomSfuIntent(this.sfuClient(), this.env, intent),
      }
    );
  }

  private async flush(socket: WebSocket, result: MeetRoomOutcome) {
    this.snapshot = result.state;
    this.snapshot = this.connectionState();
    await this.persist();
    await this.scheduleEmptyRoom();
    if (this.snapshot.budget?.pendingPublications?.length)
      await this.scheduleSweep(Date.now());
    this.delivery.sendToSocket(socket, result.reply);
    this.broadcast(result.broadcast);
    this.delivery.sendToManagers(result.toManagers);
    for (const entry of result.direct)
      this.delivery.sendToUser(entry.userId, [entry.message]);
    this.delivery.disconnect(result.disconnect);
  }

  async webSocketClose(socket: WebSocket, code: number) {
    await this.releaseSocket(socket, code !== 1000);
  }

  async webSocketError(socket: WebSocket) {
    await this.releaseSocket(socket, true);
  }

  private async releaseSocket(socket: WebSocket, recoverable = false) {
    await this.load();
    const token = this.delivery.tokenOf(socket);
    if (!token) return;
    if (
      !this.snapshot.presence[token.userId] &&
      !this.snapshot.waiting[token.userId]
    )
      return;

    // Only drop presence once the participant has no socket left, so a page
    // with two tabs does not remove itself from the room.
    const stillConnected = this.sockets().some(
      (candidate) =>
        candidate !== socket &&
        candidate.readyState === WebSocket.OPEN &&
        this.delivery.tokenOf(candidate)?.userId === token.userId
    );
    if (stillConnected) return;
    if (recoverable && this.snapshot.presence[token.userId]) {
      // Keep SFU tracks during the existing 30-second presence grace period.
      // The alarm retires them if the same device does not reconnect.
      this.snapshot.presence = {
        ...this.snapshot.presence,
        [token.userId]: {
          ...this.snapshot.presence[token.userId]!,
          lastSeenAt: new Date().toISOString(),
        },
      };
      this.snapshot = this.connectionState(socket, token);
      await this.persist();
      await this.scheduleSweep();
      return;
    }

    this.snapshot = accountRoomTime(this.snapshot, Date.now());
    const outcome = releaseParticipant(
      this.snapshot,
      token.userId,
      token.roomId,
      meetClassFeatures(this.env)
    );
    this.snapshot = outcome.state;
    this.snapshot = this.connectionState(socket, token);
    await this.persist();
    await this.scheduleEmptyRoom();
    this.broadcast(outcome.broadcast);
    this.delivery.sendToManagers(outcome.toManagers);
  }

  private async scheduleSweep(deadline = Date.now() + PRESENCE_SWEEP_MS) {
    const existing = await this.state.storage.getAlarm();
    if (existing === null || existing > deadline)
      await this.state.storage.setAlarm(deadline);
  }

  async alarm() {
    await this.load();
    const now = Date.now();
    if (
      await wakeAttendanceCopies({
        env: this.env,
        storage: this.state.storage,
        now,
        snapshot: this.snapshot,
        roomName: this.roomName,
        waitUntil: (task) => this.state.waitUntil?.(task),
        persist: () => this.persist(),
      })
    )
      return;
    const features = meetClassFeatures(this.env);
    const retained = retainRoomAttendance(this.snapshot, features, now);
    if (retained !== this.snapshot) {
      this.snapshot = retained;
      await this.persist();
    }
    const emptyVersion = this.snapshot.lifecycle?.version;
    const expiredBudget = expireRoomBudget(this.snapshot, now, features);
    if (expiredBudget) {
      this.snapshot = expiredBudget.state;
      await this.persist();
      this.broadcast(expiredBudget.broadcast);
      this.delivery.disconnect(expiredBudget.disconnect);
    }
    await cleanupRoomPublications({
      readSnapshot: () => this.snapshot,
      now,
      closeTracks: (input) => this.sfuClient().closeTracks(input),
      getSession: (sessionId) => this.sfuClient().getSession(sessionId),
      persist: async (snapshot) => {
        this.snapshot = snapshot;
        await this.persist();
      },
    });
    const expiredLive = expireRoomLive(this.snapshot);
    if (expiredLive) {
      this.snapshot = expiredLive.state;
      await this.persist();
      this.broadcast(expiredLive.messages);
    }

    const sockets = this.sockets();
    const connectedUserIds = this.delivery.connectedUsers();
    const accounted = accountRoomTime(this.snapshot, Date.now());
    if (accounted !== this.snapshot) {
      this.snapshot = accounted;
      await this.persist();
    }
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
      const releases = [];
      for (const userId of expired) {
        const token = sockets
          .map((socket) => this.delivery.tokenOf(socket))
          .find((candidate) => candidate?.userId === userId);
        const firstSocket = sockets[0];
        const roomId =
          token?.roomId ??
          (firstSocket
            ? this.delivery.tokenOf(firstSocket)?.roomId
            : undefined);
        const outcome = releaseParticipant(
          this.snapshot,
          userId,
          roomId ?? '',
          meetClassFeatures(this.env)
        );
        this.snapshot = outcome.state;
        releases.push(outcome);
      }
      await this.persist();
      for (const outcome of releases) {
        this.broadcast(outcome.broadcast);
        this.delivery.sendToManagers(outcome.toManagers);
      }
      for (const userId of expired)
        for (const socket of sockets)
          if (
            this.delivery.tokenOf(socket)?.userId === userId &&
            socket.readyState === WebSocket.OPEN
          )
            socket.close(4000, 'heartbeat_timeout');
    }

    const observed = observeRoomConnections(
      this.snapshot,
      connectedUserIds,
      Date.now()
    );
    if (observed !== this.snapshot) {
      this.snapshot = observed;
      await this.persist();
    }
    const empty = expireEmptyRoom(
      this.snapshot,
      emptyVersion,
      connectedUserIds,
      Date.now(),
      meetClassFeatures(this.env)
    );
    if (empty) {
      this.snapshot = empty.state;
      await this.persist();
      this.broadcast(empty.broadcast);
      this.delivery.disconnect(empty.disconnect);
    }
    await scheduleRoomFollowUps({
      snapshot: this.snapshot,
      connectedUserIds,
      now: Date.now(),
      scheduleSweep: (deadline) => this.scheduleSweep(deadline),
      scheduleEmptyRoom: () => this.scheduleEmptyRoom(),
    });
  }
}
