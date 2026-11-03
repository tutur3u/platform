import { Y } from '@tuturuuu/realtime/collaboration/server';
import {
  channelBroadcastSchema as broadcast,
  CHANNEL_FRAME_BYTES,
  type ChannelTicket,
  channelTicketSchema,
  channelClientFrameSchema as frame,
} from '../../../packages/realtime/src/channels/schema';
import { serviceRequestHeaders } from '../../../packages/realtime/src/core/service-request';
import {
  signRealtimePayload,
  verifyRealtimePayload,
} from '../../../packages/realtime/src/core/token';
import {
  awarenessRemoval,
  normalizeAwarenessUpdate,
} from '../../../packages/realtime/src/documents/awareness';
import {
  DOCUMENT_CHECKPOINT_EVENT,
  type DocumentCheckpointStatus,
} from '../../../packages/realtime/src/documents/checkpoint';
import { emptyErase, type PersistedErase } from './channel-document-erase';
import { ChannelDocumentErase } from './channel-document-erase-protocol';

export interface ChannelRoomEnv {
  CHANNEL_ROOM: DurableObjectNamespace;
  MEET_REALTIME_TOKEN_SECRET: string;
  PLATFORM_API_BASE_URL?: string;
  MEET_ERASE_DO_PUBLIC_KEYS?: string;
  MEET_ERASE_CALLBACK_KEY_V1?: string;
}
type Attachment = {
  ticket: ChannelTicket;
  id: string;
  self: boolean;
  presence: Record<string, unknown> | null;
  windowAt: number;
  count: number;
  awarenessClientId?: number;
  awarenessClock?: number;
};
/** Broadcast/presence authority and durable rich-text document transport. */
export class ChannelRoomDurableObject implements DurableObject {
  doc = new Y.Doc();
  private dirty = false;
  erase: PersistedErase = emptyErase();
  documentAllowed = false;
  documentPresent = false;
  private serial: Promise<unknown> = Promise.resolve();
  metadata: {
    topic: string;
    ownerId: string;
    documentId: string;
    savedHash?: string;
    checkpointAt: number;
    version: number;
    checkpointFailures?: number;
    checkpointRetry?: { attempts: number; expiresAt: number };
    checkpointStatus?: DocumentCheckpointStatus;
  } | null = null;
  private ready: Promise<void>;
  private eraseProtocol: ChannelDocumentErase;
  private alarmInFlight: Promise<void> | null = null;
  constructor(
    readonly state: DurableObjectState,
    readonly env: ChannelRoomEnv
  ) {
    this.eraseProtocol = new ChannelDocumentErase(this);
    this.ready = state.blockConcurrencyWhile(async () => {
      const [update, metadata, erase] = await Promise.all([
        state.storage.get<Uint8Array>('document'),
        state.storage.get<typeof this.metadata>('metadata'),
        state.storage.get<PersistedErase>('erase'),
      ]);
      if (update) Y.applyUpdate(this.doc, update);
      this.documentPresent = update !== undefined;
      this.metadata = metadata ?? null;
      this.erase = erase ?? emptyErase();
    });
  }
  fetch(request: Request) {
    const run = this.serial.then(() => this.handleFetch(request));
    this.serial = run.catch(() => {});
    return run;
  }
  private async handleFetch(request: Request) {
    await this.ready;
    if (new URL(request.url).pathname === '/channels/erase')
      return this.eraseProtocol.eraseCommand(request);
    const ticket = JSON.parse(
      request.headers.get('x-channel-ticket') ?? 'null'
    ) as ChannelTicket | null;
    if (!ticket || ticket.exp * 1000 <= Date.now())
      return new Response(null, { status: 401 });
    if (ticket.topic.startsWith('meeting-document-')) {
      if (!ticket.documentId || !ticket.ownerId)
        return new Response(null, { status: 403 });
      if (
        this.metadata &&
        (this.metadata.topic !== ticket.topic ||
          this.metadata.documentId !== ticket.documentId ||
          this.metadata.ownerId !== ticket.ownerId)
      )
        return new Response(null, { status: 403 });
      if (!this.metadata) {
        this.metadata = {
          topic: ticket.topic,
          ownerId: ticket.ownerId,
          documentId: ticket.documentId,
          checkpointAt: 0,
          version: ticket.version ?? 0,
        };
        await this.state.storage.put('metadata', this.metadata);
      }
    }
    if (ticket.topic.startsWith('meeting-document-')) {
      if (
        !(await this.eraseProtocol.checkDocumentGate()) ||
        (ticket.docGeneration ?? 0) !== this.erase.installedGeneration
      )
        return Response.json({ code: 'doc_locked' }, { status: 423 });
      if (this.erase.installedGeneration > 0 && (ticket.docProtocol ?? 1) < 2)
        ticket.role = 'viewer';
    }
    if (ticket.kind === 'document') {
      if (request.method !== 'GET') return new Response(null, { status: 405 });
      return Response.json({
        state: Array.from(Y.encodeStateAsUpdate(this.doc)),
      });
    }
    if (ticket.kind === 'publish') {
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      const text = await request.text();
      if (new TextEncoder().encode(text).length > CHANNEL_FRAME_BYTES)
        return new Response(null, { status: 413 });
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        return new Response(null, { status: 400 });
      }
      const parsed = broadcast.safeParse(value);
      if (!parsed.success) return new Response(null, { status: 400 });
      this.broadcast(parsed.data);
      return Response.json({ ok: true });
    }
    if (request.headers.get('Upgrade') !== 'websocket')
      return new Response(null, { status: 426 });
    if (this.state.getWebSockets().length >= 128)
      return new Response(null, { status: 429 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const socket = pair[1];
    const attachment: Attachment = {
      ticket,
      id: crypto.randomUUID(),
      self: new URL(request.url).searchParams.get('self') === 'true',
      presence: null,
      windowAt: Date.now(),
      count: 0,
    };
    socket.serializeAttachment(attachment);
    this.state.acceptWebSocket(socket);
    if (
      this.metadata &&
      ticket.role === 'editor' &&
      ((this.metadata.checkpointFailures ?? 0) >= 3 ||
        (this.metadata.checkpointRetry?.attempts ?? 0) >= 3 ||
        (this.metadata.checkpointRetry?.expiresAt ?? Infinity) <= Date.now())
    ) {
      this.metadata.checkpointFailures = 0;
      delete this.metadata.checkpointRetry;
      this.metadata.checkpointAt = Date.now();
      this.dirty = true;
      this.state.waitUntil(this.schedulePersistence());
    }
    this.send(socket, { type: 'presence', state: this.presenceState() });
    if (
      ticket.topic.startsWith('task-editor-') ||
      ticket.topic.startsWith('meeting-document-')
    )
      this.send(socket, {
        type: 'broadcast',
        event: 'message',
        payload: Array.from(Y.encodeStateAsUpdate(this.doc)),
      });
    if (this.metadata?.checkpointStatus)
      this.send(socket, {
        type: 'broadcast',
        event: DOCUMENT_CHECKPOINT_EVENT,
        payload: {
          status: this.metadata.checkpointStatus,
          version: this.metadata.version,
        },
      });
    // An alarm also expires quiet sockets; expired tickets cannot retain read access.
    const alarm = await this.state.storage.getAlarm();
    if (!alarm || alarm > ticket.exp * 1000)
      await this.state.storage.setAlarm(ticket.exp * 1000);
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const run = this.serial.then(async () => {
      await this.ready;
      if (this.metadata && !(await this.eraseProtocol.checkDocumentGate()))
        return socket.close(4423, 'doc_locked');
      this.handleSocketMessage(socket, message);
    });
    this.serial = run.catch(() => socket.close(1011, 'Document unavailable'));
    return run;
  }
  private handleSocketMessage(
    socket: WebSocket,
    message: string | ArrayBuffer
  ) {
    const attachment = socket.deserializeAttachment() as Attachment;
    if (
      this.metadata &&
      (this.erase.freeze ||
        !this.documentAllowed ||
        (attachment.ticket.docGeneration ?? 0) !==
          this.erase.installedGeneration ||
        (attachment.ticket.role === 'editor' &&
          this.erase.installedGeneration > 0 &&
          (attachment.ticket.docProtocol ?? 1) < 2))
    )
      return socket.close(4423, 'doc_locked');
    if (attachment.ticket.exp * 1000 <= Date.now())
      return socket.close(1008, 'Ticket expired');
    if (
      typeof message !== 'string' ||
      new TextEncoder().encode(message).length > CHANNEL_FRAME_BYTES
    )
      return socket.close(1009, 'Frame exceeds limit');
    if (Date.now() - attachment.windowAt >= 1000) {
      attachment.windowAt = Date.now();
      attachment.count = 0;
    }
    if (++attachment.count > 30) return socket.close(1008, 'Rate limit');
    try {
      const parsed = frame.parse(JSON.parse(message));
      if (parsed.type === 'authenticate') {
        const next = channelTicketSchema.safeParse(
          verifyRealtimePayload(
            parsed.token,
            this.env.MEET_REALTIME_TOKEN_SECRET
          )
        );
        if (
          !next.success ||
          next.data.kind !== 'join' ||
          next.data.exp * 1000 <= Date.now() ||
          next.data.topic !== attachment.ticket.topic ||
          next.data.userId !== attachment.ticket.userId ||
          next.data.ownerId !== attachment.ticket.ownerId ||
          next.data.documentId !== attachment.ticket.documentId ||
          (this.metadata !== null &&
            ((next.data.docGeneration ?? 0) !==
              this.erase.installedGeneration ||
              (this.erase.installedGeneration > 0 &&
                next.data.role === 'editor' &&
                (next.data.docProtocol ?? 1) < 2)))
        )
          return socket.close(1008, 'Invalid refresh');
        attachment.ticket = next.data;
        socket.serializeAttachment(attachment);
        this.state.waitUntil(this.scheduleExpiry(next.data.exp * 1000));
        return;
      }
      if (parsed.type === 'broadcast') {
        if (parsed.event === DOCUMENT_CHECKPOINT_EVENT)
          return socket.close(1008, 'Service-only event');
        if (attachment.ticket.role !== 'editor' && parsed.event !== 'awareness')
          return socket.close(1008, 'Read only');
        if (
          (attachment.ticket.topic.startsWith('task-editor-') ||
            attachment.ticket.topic.startsWith('meeting-document-')) &&
          parsed.event === 'message'
        ) {
          if (
            !Array.isArray(parsed.payload) ||
            parsed.payload.length > 512 * 1024 ||
            !parsed.payload.every(
              (value) => Number.isInteger(value) && value >= 0 && value <= 255
            )
          )
            return socket.close(1008, 'Invalid document update');
          const candidate = new Y.Doc();
          try {
            Y.applyUpdate(candidate, Y.encodeStateAsUpdate(this.doc));
            Y.applyUpdate(candidate, Uint8Array.from(parsed.payload));
            const merged = Y.encodeStateAsUpdate(candidate);
            if (merged.length > 512 * 1024)
              return socket.close(1009, 'Document exceeds limit');
            Y.applyUpdate(this.doc, merged);
          } finally {
            candidate.destroy();
          }
          if (this.metadata) this.metadata.version++;
          this.dirty = true;
          this.state.waitUntil(this.schedulePersistence());
        }
        if (parsed.event === 'awareness') {
          if (
            !Array.isArray(parsed.payload) ||
            parsed.payload.length > 16384 ||
            !parsed.payload.every(
              (value) => Number.isInteger(value) && value >= 0 && value <= 255
            )
          )
            return socket.close(1008, 'Invalid awareness');
          const own = normalizeAwarenessUpdate(
            Uint8Array.from(parsed.payload),
            attachment.ticket.userId,
            attachment.awarenessClientId
          );
          if (!own) return;
          if (
            attachment.awarenessClientId === undefined &&
            this.state
              .getWebSockets()
              .some(
                (peer) =>
                  peer !== socket &&
                  (peer.deserializeAttachment() as Attachment)
                    .awarenessClientId === own.clientId &&
                  (peer.deserializeAttachment() as Attachment).ticket.userId !==
                    attachment.ticket.userId
              )
          )
            return socket.close(1008, 'Awareness identity collision');
          attachment.awarenessClientId = own.clientId;
          attachment.awarenessClock = own.clock;
          parsed.payload = Array.from(own.update);
        }
        this.broadcast(parsed, attachment.self ? undefined : socket);
      } else {
        if (
          parsed.type === 'track' &&
          new TextEncoder().encode(JSON.stringify(parsed.payload)).length >
            16384
        )
          return socket.close(1009, 'Presence exceeds limit');
        attachment.presence =
          parsed.type === 'track'
            ? {
                ...parsed.payload,
                ...(parsed.payload.user &&
                typeof parsed.payload.user === 'object'
                  ? {
                      user: {
                        ...parsed.payload.user,
                        id: attachment.ticket.userId,
                      },
                    }
                  : {}),
                user_id: attachment.ticket.userId,
                userId: attachment.ticket.userId,
              }
            : null;
        socket.serializeAttachment(attachment);
        this.broadcast({ type: 'presence', state: this.presenceState() });
      }
      socket.serializeAttachment(attachment);
    } catch {
      socket.close(1008, 'Invalid frame');
    }
  }
  webSocketClose(socket: WebSocket) {
    const attachment = socket.deserializeAttachment() as Attachment;
    socket.close();
    if (
      attachment.awarenessClientId !== undefined &&
      !this.state
        .getWebSockets()
        .some(
          (peer) =>
            peer !== socket &&
            (peer.deserializeAttachment() as Attachment).awarenessClientId ===
              attachment.awarenessClientId &&
            (peer.deserializeAttachment() as Attachment).ticket.exp * 1000 >
              Date.now()
        )
    )
      this.broadcast(
        {
          type: 'broadcast',
          event: 'awareness',
          payload: Array.from(
            awarenessRemoval(
              attachment.awarenessClientId,
              attachment.awarenessClock ?? 0
            )
          ),
        },
        socket
      );
    this.broadcast(
      { type: 'presence', state: this.presenceState(socket) },
      socket
    );
  }
  webSocketError(socket: WebSocket) {
    this.webSocketClose(socket);
  }
  private async scheduleExpiry(deadline: number) {
    const alarm = await this.state.storage.getAlarm();
    if (!alarm || alarm > deadline) await this.state.storage.setAlarm(deadline);
  }
  private async schedulePersistence() {
    const deadline = Date.now() + 1000;
    const alarm = await this.state.storage.getAlarm();
    if (!alarm || alarm > deadline) await this.state.storage.setAlarm(deadline);
  }
  alarm() {
    this.alarmInFlight ??= this.serial
      .then(() => this.runAlarm())
      .finally(() => {
        this.alarmInFlight = null;
      });
    this.serial = this.alarmInFlight.catch(() => {});
    return this.alarmInFlight;
  }
  private async runAlarm() {
    await this.ready;
    if (this.dirty) {
      this.dirty = false;
      await this.state.storage.put({
        document: Y.encodeStateAsUpdate(this.doc),
        ...(this.metadata ? { metadata: this.metadata } : {}),
      });
    }
    let next = Infinity;
    if (this.erase.freeze && this.erase.freeze.lease_exp <= Date.now()) {
      try {
        const status = await this.eraseProtocol.platformEraseCall('status', {
          operation_key: this.erase.freeze.operation_key,
        });
        if (
          status.state === 'not_committed' ||
          (status.state === 'in_progress' &&
            this.erase.freeze.decision === 'leave' &&
            status.committed === true)
        ) {
          const erase = { ...this.erase, freeze: null };
          await this.state.storage.put('erase', erase);
          this.erase = erase;
        }
      } catch {}
      if (this.erase.freeze) next = Date.now() + 30000;
    }
    if (this.metadata && (await this.eraseProtocol.checkDocumentGate()))
      next = Math.min(next, await this.checkpointDocument());
    for (const socket of this.state.getWebSockets()) {
      const { ticket } = socket.deserializeAttachment() as Attachment;
      if (ticket.exp * 1000 <= Date.now()) socket.close(1008, 'Ticket expired');
      else next = Math.min(next, ticket.exp * 1000);
    }
    this.broadcast({ type: 'presence', state: this.presenceState() });
    if (this.dirty) next = Math.min(next, Date.now() + 1000);
    if (Number.isFinite(next)) await this.state.storage.setAlarm(next);
  }
  private async checkpointDocument() {
    const metadata = this.metadata;
    if (!metadata) return Infinity;
    if (
      ((metadata.checkpointFailures ?? 0) >= 3 && !this.hasActiveEditor()) ||
      (metadata.checkpointRetry?.attempts ?? 0) >= 3 ||
      (metadata.checkpointRetry?.expiresAt ?? Infinity) <= Date.now()
    )
      return Infinity;
    const update = Y.encodeStateAsUpdate(this.doc);
    const version = metadata.version;
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', new Uint8Array(update))
      ),
      (value) => value.toString(16).padStart(2, '0')
    ).join('');
    if (hash === metadata.savedHash) return Infinity;
    if (Date.now() < metadata.checkpointAt) return metadata.checkpointAt;
    if (!this.hasActiveEditor()) {
      const retry = metadata.checkpointRetry ?? {
        attempts: 0,
        expiresAt: Date.now() + 120_000,
      };
      const reserved = {
        ...metadata,
        checkpointAt: Date.now() + 30_000,
        checkpointRetry: { ...retry, attempts: retry.attempts + 1 },
      };
      // Failed persistence must not spend provider work or replenish attempts.
      await this.state.storage.put('metadata', reserved);
      Object.assign(metadata, reserved);
    }
    const exp = Math.floor(Date.now() / 1000) + 30;
    const token = signRealtimePayload(
      {
        aud: 'tuturuuu.channels',
        kind: 'document-checkpoint',
        docGeneration: this.erase.installedGeneration,
        version,
        topic: metadata.topic,
        userId: metadata.ownerId,
        ownerId: metadata.ownerId,
        documentId: metadata.documentId,
        role: 'editor',
        exp,
      },
      this.env.MEET_REALTIME_TOKEN_SECRET
    );
    let failure: DocumentCheckpointStatus = 'deferred';
    try {
      const base = new URL(
        this.env.PLATFORM_API_BASE_URL ?? 'https://tuturuuu.com'
      );
      if (
        base.protocol !== 'https:' &&
        !(
          base.protocol === 'http:' &&
          ['127.0.0.1', 'localhost'].includes(base.hostname)
        )
      )
        throw new Error('Invalid checkpoint endpoint');
      // Workers send no User-Agent; the platform API proxy rejects anonymous
      // API requests without one, so the service identity must be explicit.
      const response = await fetch(
        new URL('/api/v1/realtime/documents/checkpoint', base),
        {
          method: 'POST',
          headers: serviceRequestHeaders(token),
          body: JSON.stringify({ state: Array.from(update), hash }),
          signal: AbortSignal.timeout(15000),
          redirect: 'manual',
        }
      );
      await response.arrayBuffer();
      if (response.status === 409) failure = 'conflict';
      if (!response.ok)
        throw new Error(`Document checkpoint failed (${response.status})`);
      metadata.savedHash = hash;
      metadata.checkpointStatus = 'saved';
      metadata.checkpointFailures = 0;
      delete metadata.checkpointRetry;
    } catch (error) {
      metadata.checkpointFailures = (metadata.checkpointFailures ?? 0) + 1;
      metadata.checkpointStatus = failure;
      console.warn('Meeting document checkpoint deferred', {
        status: failure,
        failures: metadata.checkpointFailures,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
    this.broadcast({
      type: 'broadcast',
      event: DOCUMENT_CHECKPOINT_EVENT,
      payload: { status: metadata.checkpointStatus, version },
    });
    metadata.checkpointAt = Math.max(
      metadata.checkpointAt,
      Date.now() +
        Math.min(
          60000,
          10000 * 2 ** Math.min(metadata.checkpointFailures ?? 0, 3)
        )
    );
    await this.state.storage.put({
      metadata,
      document: Y.encodeStateAsUpdate(this.doc),
    });
    if (
      ((metadata.checkpointFailures ?? 0) >= 3 && !this.hasActiveEditor()) ||
      (metadata.checkpointRetry?.attempts ?? 0) >= 3 ||
      (metadata.checkpointRetry?.expiresAt ?? Infinity) <= Date.now()
    )
      return Infinity;
    return version !== metadata.version || metadata.savedHash !== hash
      ? Math.min(
          metadata.checkpointAt,
          metadata.checkpointRetry?.expiresAt ?? Infinity
        )
      : Infinity;
  }

  private hasActiveEditor() {
    return this.state.getWebSockets().some((socket) => {
      const { ticket } = socket.deserializeAttachment() as Attachment;
      return ticket.role === 'editor' && ticket.exp * 1000 > Date.now();
    });
  }
  private presenceState(exclude?: WebSocket) {
    const result: Record<string, Record<string, unknown>[]> = {};
    for (const socket of this.state.getWebSockets()) {
      if (socket === exclude) continue;
      const a = socket.deserializeAttachment() as Attachment;
      if (!a.presence || a.ticket.exp * 1000 <= Date.now()) continue;
      const presence = result[a.ticket.userId] ?? [];
      result[a.ticket.userId] = presence;
      presence.push({
        ...a.presence,
        presence_ref: a.id,
      });
    }
    return result;
  }
  private broadcast(message: unknown, exclude?: WebSocket) {
    for (const socket of this.state.getWebSockets()) {
      if (socket === exclude) continue;
      const a = socket.deserializeAttachment() as Attachment;
      if (a.ticket.exp * 1000 > Date.now()) this.send(socket, message);
    }
  }
  private send(socket: WebSocket, message: unknown) {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      socket.close(1011, 'Connection unavailable');
    }
  }
}
