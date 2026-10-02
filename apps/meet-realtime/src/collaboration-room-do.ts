import { createHash } from 'node:crypto';
import {
  type CollaborationPresence,
  type CollaborationTicket,
  collaborationClientMessage,
  collaborationTicketSchema,
  createProgrammingDocument,
  mergeRunnerFiles,
  programmingDocumentSnapshot,
  Y,
} from '../../../packages/realtime/src/collaboration';
import {
  signRealtimePayload,
  verifyRealtimePayload,
} from '../../../packages/realtime/src/core/token';
import {
  PlaygroundFiles,
  PlaygroundRunnerExport,
} from '../../../packages/utils/src/playground-schema';

export interface CollaborationRoomEnv {
  COLLABORATION_ROOM: DurableObjectNamespace;
  MEET_REALTIME_TOKEN_SECRET: string;
  PLATFORM_API_BASE_URL?: string;
}
type Attachment = {
  ticket: CollaborationTicket;
  connectionId: string;
  windowAt: number;
  messages: number;
  presence: CollaborationPresence;
};
type Metadata = {
  ownerId: string;
  resourceId: string;
  resource: 'playground' | 'problem';
  roomId: string;
  meetingId?: string;
  revision: number;
  checkpointHash: string | null;
  fileHashes: Record<string, string>;
  runId?: string;
  runnerId?: string;
  runnerHashes?: Record<string, string>;
  runnerNeedsAck?: boolean;
};
const KEY = 'programming-document';
function encoded(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('base64');
}
function decoded(value: string) {
  return new Uint8Array(Buffer.from(value, 'base64'));
}
export class CollaborationRoomDurableObject implements DurableObject {
  private doc = new Y.Doc();
  private metadata: Metadata | null = null;
  private ready: Promise<void>;
  private persisting: Promise<void> | null = null;
  private dirty = false;
  private checkpointing: Promise<void> | null = null;
  private saveFailures = 0;
  private runnerIngestion: Promise<unknown> = Promise.resolve();
  constructor(
    private state: DurableObjectState,
    private env: CollaborationRoomEnv
  ) {
    this.ready = state.blockConcurrencyWhile(async () => {
      const [update, metadata] = await Promise.all([
        state.storage.get<Uint8Array>(KEY),
        state.storage.get<Metadata>('metadata'),
      ]);
      if (update) Y.applyUpdate(this.doc, update);
      this.metadata = metadata ?? null;
      this.dirty = !!metadata;
    });
  }
  async fetch(request: Request) {
    await this.ready;
    const ticket = JSON.parse(
      request.headers.get('x-collaboration-ticket') ?? 'null'
    ) as CollaborationTicket;
    if (!ticket || ticket.exp * 1000 <= Date.now())
      return new Response('Unauthorized', { status: 401 });
    if (ticket.kind === 'seed') {
      if (
        this.metadata &&
        (ticket.roomId !== this.metadata.roomId ||
          ticket.ownerId !== this.metadata.ownerId ||
          ticket.resourceId !== this.metadata.resourceId)
      )
        return new Response(null, { status: 403 });
      if (request.method === 'GET')
        return Response.json({ ready: !!this.metadata });
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      if (!this.metadata) {
        const body = (await request.json()) as {
          files: { path: string; content: string }[];
          command: string;
          revision: number;
        };
        const files = PlaygroundFiles.parse(body.files);
        if (body.command.length > 4096)
          return new Response(null, { status: 400 });
        this.doc.destroy();
        this.doc = createProgrammingDocument(files, body.command);
        this.metadata = {
          ownerId: ticket.ownerId,
          resourceId: ticket.resourceId,
          resource: ticket.resource,
          roomId: ticket.roomId,
          meetingId: ticket.meetingId,
          revision: body.revision,
          checkpointHash: null,
          fileHashes: await this.fileHashes(files),
        };
        await this.state.storage.put({
          [KEY]: Y.encodeStateAsUpdate(this.doc),
          metadata: this.metadata,
        });
      }
      return Response.json({ ok: true });
    }
    if (
      !this.metadata ||
      ticket.roomId !== this.metadata.roomId ||
      ticket.ownerId !== this.metadata.ownerId ||
      ticket.resourceId !== this.metadata.resourceId ||
      ticket.resource !== this.metadata.resource ||
      ticket.meetingId !== this.metadata.meetingId
    )
      return new Response(null, { status: 403 });
    if (ticket.kind === 'runner-files') {
      const ingestion = this.runnerIngestion.then(() =>
        this.ingestRunnerFiles(request, ticket)
      );
      this.runnerIngestion = ingestion.catch(() => undefined);
      return ingestion;
    }
    if (ticket.kind === 'checkpoint') {
      if (request.method !== 'POST' || ticket.role !== 'owner')
        return new Response(null, { status: 403 });
      if (Number(request.headers.get('Content-Length') ?? 0) > 1024)
        return new Response(null, { status: 413 });
      if ((await request.arrayBuffer()).byteLength > 1024)
        return new Response(null, { status: 413 });
      await this.checkpoint();
      return Response.json({ revision: this.metadata.revision });
    }
    if (request.headers.get('Upgrade') !== 'websocket')
      return new Response(null, { status: 426 });
    if (this.state.getWebSockets().length >= 16)
      return new Response('Room full', { status: 429 });
    const pair = new WebSocketPair();
    const connectionId = crypto.randomUUID();
    pair[1].serializeAttachment({
      ticket,
      connectionId,
      windowAt: Date.now(),
      messages: 0,
      presence: {
        userId: ticket.userId,
        displayName: ticket.displayName,
        connectionId,
        file: null,
        cursor: null,
        pointer: null,
      },
    } satisfies Attachment);
    this.state.acceptWebSocket(pair[1]);
    pair[1].send(
      JSON.stringify({
        type: 'sync',
        update: encoded(Y.encodeStateAsUpdate(this.doc)),
        stateVector: encoded(Y.encodeStateVector(this.doc)),
      })
    );
    this.broadcastPresence();
    await this.scheduleAlarm();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer) {
    await this.ready;
    const attachment = socket.deserializeAttachment() as Attachment;
    if (attachment.ticket.exp * 1000 <= Date.now()) {
      socket.close(1008, 'Ticket expired');
      return;
    }
    if (
      typeof data !== 'string' ||
      new TextEncoder().encode(data).length > 4_500_000
    ) {
      socket.close(1009, 'Message exceeds limit');
      return;
    }
    if (Date.now() - attachment.windowAt >= 1000) {
      attachment.windowAt = Date.now();
      attachment.messages = 0;
    }
    if (++attachment.messages > 30) {
      socket.close(1008, 'Message rate exceeded');
      return;
    }
    socket.serializeAttachment(attachment);
    try {
      const message = collaborationClientMessage.parse(JSON.parse(data));
      if (message.type === 'authenticate') {
        const next = collaborationTicketSchema.safeParse(
          verifyRealtimePayload(
            message.token,
            this.env.MEET_REALTIME_TOKEN_SECRET
          )
        );
        if (
          !next.success ||
          next.data.kind !== 'join' ||
          next.data.exp * 1000 <= Date.now() ||
          next.data.roomId !== attachment.ticket.roomId ||
          next.data.userId !== attachment.ticket.userId ||
          next.data.ownerId !== attachment.ticket.ownerId ||
          next.data.resourceId !== attachment.ticket.resourceId ||
          next.data.resource !== attachment.ticket.resource ||
          next.data.meetingId !== attachment.ticket.meetingId
        ) {
          socket.close(1008, 'Invalid refresh');
          return;
        }
        attachment.ticket = next.data;
        attachment.presence.displayName = next.data.displayName;
        socket.serializeAttachment(attachment);
        await this.scheduleAlarm();
        return;
      }
      if (message.type === 'presence') {
        attachment.presence = { ...attachment.presence, ...message.presence };
        socket.serializeAttachment(attachment);
        this.broadcastPresence();
        return;
      }
      if (attachment.ticket.role === 'viewer') {
        socket.close(1008, 'Read-only room');
        return;
      }
      const update = decoded(message.update);
      const candidate = new Y.Doc();
      try {
        Y.applyUpdate(candidate, Y.encodeStateAsUpdate(this.doc));
        Y.applyUpdate(candidate, update);
        const snapshot = programmingDocumentSnapshot(candidate);
        PlaygroundFiles.parse(snapshot.files);
        if (
          snapshot.command.length > 4096 ||
          Y.encodeStateAsUpdate(candidate).byteLength > 3_000_000
        )
          throw new Error('Document exceeds budget');
        Y.applyUpdate(this.doc, update);
        this.dirty = true;
      } finally {
        candidate.destroy();
      }
      this.broadcast({ type: 'update', update: message.update }, socket);
      this.state.waitUntil(this.persist());
      await this.scheduleAlarm();
    } catch {
      socket.close(1008, 'Invalid document update');
    }
  }
  private async ingestRunnerFiles(
    request: Request,
    ticket: CollaborationTicket
  ) {
    if (
      request.method !== 'POST' ||
      ticket.role !== 'owner' ||
      !ticket.runId ||
      !ticket.runnerId ||
      ticket.resource !== 'playground'
    )
      return new Response(null, { status: 403 });
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 3 * 1024 * 1024)
      return new Response(null, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response(null, { status: 400 });
    }
    const parsed = PlaygroundRunnerExport.safeParse(body);
    if (!parsed.success) return new Response(null, { status: 400 });
    try {
      if (this.checkpointing) await this.checkpointing.catch(() => undefined);
      const metadata = this.metadata!;
      if (parsed.data.revision !== metadata.revision)
        return new Response(null, { status: 409 });
      const candidate = new Y.Doc();
      let result: ReturnType<typeof mergeRunnerFiles>;
      try {
        Y.applyUpdate(candidate, Y.encodeStateAsUpdate(this.doc));
        result = mergeRunnerFiles(
          candidate,
          metadata.runId === ticket.runId
            ? (metadata.runnerHashes ?? parsed.data.baseline)
            : parsed.data.baseline,
          parsed.data.files,
          parsed.data.paths,
          (content) => createHash('sha256').update(content).digest('hex')
        );
        PlaygroundFiles.parse(programmingDocumentSnapshot(candidate).files);
        if (Y.encodeStateAsUpdate(candidate).byteLength > 3_000_000)
          throw new Error('Document exceeds budget');
        const original = programmingDocumentSnapshot(this.doc);
        const snapshot = programmingDocumentSnapshot(candidate);
        const hashes = Object.fromEntries(
          snapshot.files.map((file) => [
            file.path,
            createHash('sha256').update(file.content).digest('hex'),
          ])
        );
        // Commit the candidate against the live run lease before it can reach
        // the durable room or any audience. A signed ticket is not a lease.
        const commit = this.sendCheckpoint(
          snapshot,
          'runner-files',
          ticket.runId,
          ticket.runnerId
        );
        this.checkpointing = commit.then(
          () => undefined,
          () => undefined
        );
        let saved: { revision: number; runComplete?: boolean };
        try {
          saved = await commit;
        } finally {
          this.checkpointing = null;
        }
        // An editor can change a runner-touched file while Drive is committing.
        // Preserve that newer edit (including deletion) in the live room; its
        // divergence remains dirty and receives a separate checkpoint.
        const before = new Map(
          original.files.map((file) => [file.path, file.content])
        );
        const committed = new Map(
          snapshot.files.map((file) => [file.path, file.content])
        );
        const latest = new Map(
          programmingDocumentSnapshot(this.doc).files.map((file) => [
            file.path,
            file.content,
          ])
        );
        const preserve = [
          ...new Set([...before.keys(), ...committed.keys()]),
        ].filter(
          (path) =>
            before.get(path) !== committed.get(path) &&
            latest.get(path) !== before.get(path)
        );
        const vector = Y.encodeStateVector(this.doc);
        Y.applyUpdate(this.doc, result.update);
        const files = this.doc.getMap<Y.Text>('files');
        this.doc.transact(() => {
          for (const path of preserve) {
            const content = latest.get(path);
            if (content === undefined) files.delete(path);
            else files.set(path, new Y.Text(content));
          }
        }, 'concurrent-editor');
        result.update = Y.encodeStateAsUpdate(this.doc, vector);
        metadata.revision = saved.revision;
        metadata.fileHashes = hashes;
        metadata.checkpointHash = createHash('sha256')
          .update(JSON.stringify(snapshot))
          .digest('hex');
        this.dirty =
          JSON.stringify(snapshot) !==
          JSON.stringify(programmingDocumentSnapshot(this.doc));
      } finally {
        candidate.destroy();
      }
      metadata.runnerNeedsAck = false;
      metadata.runId = ticket.runId;
      metadata.runnerId = ticket.runnerId;
      metadata.runnerHashes = result.hashes;
      await this.state.storage.put({
        [KEY]: Y.encodeStateAsUpdate(this.doc),
        metadata,
      });
      this.broadcast({ type: 'update', update: encoded(result.update) });
      this.broadcast({ type: 'saved', revision: metadata.revision });
      if (this.dirty) await this.scheduleAlarm();
      return Response.json({ revision: metadata.revision });
    } catch {
      return new Response(null, { status: 409 });
    }
  }
  private async scheduleAlarm() {
    if ((await this.state.storage.getAlarm()) === null)
      await this.state.storage.setAlarm(Date.now() + 10_000);
  }
  private persist() {
    if (!this.persisting)
      this.persisting = new Promise<void>((resolve) =>
        setTimeout(resolve, 1000)
      )
        .then(async () => {
          await this.state.storage.put(KEY, Y.encodeStateAsUpdate(this.doc));
        })
        .finally(() => {
          this.persisting = null;
        });
    return this.persisting;
  }
  private broadcast(message: unknown, except?: WebSocket) {
    const payload = JSON.stringify(message);
    for (const socket of this.state.getWebSockets()) {
      if (socket === except) continue;
      try {
        socket.send(payload);
      } catch {
        socket.close();
      }
    }
  }
  private broadcastPresence() {
    this.broadcast({
      type: 'presence',
      participants: this.state
        .getWebSockets()
        .map(
          (socket) => (socket.deserializeAttachment() as Attachment).presence
        ),
    });
  }
  webSocketClose() {
    this.broadcastPresence();
  }
  webSocketError(socket: WebSocket) {
    socket.close();
    this.broadcastPresence();
  }
  async alarm() {
    await this.ready;
    for (const socket of this.state.getWebSockets()) {
      if (
        (socket.deserializeAttachment() as Attachment).ticket.exp * 1000 <=
        Date.now()
      )
        socket.close(1008, 'Ticket expired');
    }
    if (this.dirty)
      try {
        await this.checkpoint();
        this.saveFailures = 0;
      } catch {
        this.saveFailures++;
        this.broadcast({ type: 'save-error' });
      }
    if (
      this.state.getWebSockets().length ||
      (this.dirty && this.saveFailures < 3)
    )
      await this.state.storage.setAlarm(Date.now() + 30_000);
  }
  private checkpoint() {
    this.checkpointing ??= this.doCheckpoint().finally(() => {
      this.checkpointing = null;
    });
    return this.checkpointing;
  }
  private async fileHashes(files: { path: string; content: string }[]) {
    return Object.fromEntries(
      await Promise.all(
        files.map(async (file) => [
          file.path,
          Buffer.from(
            await crypto.subtle.digest(
              'SHA-256',
              new TextEncoder().encode(file.content)
            )
          ).toString('hex'),
        ])
      )
    );
  }
  private async doCheckpoint() {
    if (!this.metadata) return;
    await this.persist();
    if (this.metadata.resource === 'problem') {
      this.dirty = false;
      return;
    }
    if (!this.env.PLATFORM_API_BASE_URL)
      throw new Error('Drive checkpoint endpoint missing');
    const snapshot = programmingDocumentSnapshot(this.doc);
    const digest = Buffer.from(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(snapshot))
      )
    ).toString('hex');
    if (
      digest === this.metadata.checkpointHash &&
      !this.metadata.runnerNeedsAck
    ) {
      this.dirty = false;
      return;
    }
    const hashes = await this.fileHashes(snapshot.files);
    const saved = await this.sendCheckpoint(
      snapshot,
      'checkpoint',
      this.metadata.runId,
      this.metadata.runnerId
    );
    if (saved.runComplete) {
      delete this.metadata.runId;
      delete this.metadata.runnerId;
      delete this.metadata.runnerHashes;
    }
    this.metadata.runnerNeedsAck = false;
    this.metadata.revision = saved.revision;
    this.metadata.checkpointHash = digest;
    this.metadata.fileHashes = hashes;
    // New updates arriving during network I/O must schedule another checkpoint.
    this.dirty =
      JSON.stringify(snapshot) !==
      JSON.stringify(programmingDocumentSnapshot(this.doc));
    await this.state.storage.put('metadata', this.metadata);
    this.broadcast({ type: 'saved', revision: saved.revision });
  }
  private async sendCheckpoint(
    snapshot: ReturnType<typeof programmingDocumentSnapshot>,
    kind: 'checkpoint' | 'runner-files',
    runId?: string,
    runnerId?: string
  ) {
    if (!this.env.PLATFORM_API_BASE_URL)
      throw new Error('Checkpoint endpoint missing');
    const hashes = await this.fileHashes(snapshot.files);
    const token = signRealtimePayload(
      {
        aud: 'tuturuuu.collaboration',
        kind,
        runId,
        runnerId,
        roomId: this.metadata!.roomId,
        resourceId: this.metadata!.resourceId,
        resource: 'playground',
        meetingId: this.metadata!.meetingId,
        ownerId: this.metadata!.ownerId,
        userId: this.metadata!.ownerId,
        role: 'owner',
        displayName: 'Checkpoint',
        exp: Math.floor(Date.now() / 1000) + 30,
      },
      this.env.MEET_REALTIME_TOKEN_SECRET
    );
    const base = new URL(this.env.PLATFORM_API_BASE_URL);
    if (
      base.protocol !== 'https:' &&
      !['localhost', '127.0.0.1'].includes(base.hostname)
    )
      throw new Error('Invalid checkpoint origin');
    const response = await fetch(
      new URL('/api/v1/realtime/programming/checkpoint', base),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: snapshot.files.filter(
            (file) =>
              this.metadata!.fileHashes?.[file.path] !== hashes[file.path]
          ),
          paths: snapshot.files.map((file) => file.path),
          command: snapshot.command,
          revision: this.metadata!.revision,
        }),
        signal: AbortSignal.timeout(30000),
        redirect: 'manual',
      }
    );
    if (!response.ok) throw new Error('Drive checkpoint rejected');
    const saved = (await response.json()) as {
      revision: number;
      runComplete?: boolean;
    };
    if (
      !Number.isSafeInteger(saved.revision) ||
      saved.revision < this.metadata!.revision
    )
      throw new Error('Invalid checkpoint revision');
    return saved;
  }
}
