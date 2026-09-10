import type { LiveServerMessage, Session } from '@google/genai/web';
import {
  appendLiveTurn,
  EMPTY_LIVE_JOURNAL,
  needsLiveCheckpoint,
} from '../../src/features/live-assistant/context';
import {
  type LiveAssistantEvent,
  liveClientCommandSchema,
} from '../../src/features/live-assistant/contracts';
import { verifyLiveSession } from '../../src/features/live-assistant/token';
import { LiveActions } from './actions';
import type { LiveAudioBatcher } from './audio-batcher';
import { beginLiveBilling, settleLiveBilling } from './billing';
import { executeLiveDecision } from './decision';
import {
  finalizeSessionBilling,
  settlePublicBillings,
} from './finalize-billing';
import { connectLiveProvider, drainLiveProvider } from './provider';
import { LiveRegistryQueue } from './registry';
import { maintainLiveRegistry } from './registry-heartbeat';
import {
  dismissFailedLiveReview,
  type LiveProposal,
  liveReviewEvent,
  proposalSchema,
} from './reviews';
import { liveRoomCommand } from './room';
import { createRoomLiveAudioBatcher } from './room-audio-batcher';
import { cleanupEndedLiveSession } from './session-cleanup';
import type { SavedSession } from './session-state';
import { executeLiveTool } from './session-tools';
import { markInterruptedUsage, observeSessionUsage } from './session-usage';
import { type LiveEnvironment, LiveTurnArchive } from './storage';
import { replayLiveToolResponses } from './tool-responses';
import { reportLiveUsage } from './usage-report';
import {
  controlWorkspaceReview,
  expireWorkspaceReviews,
} from './workspace-review';

export class MeetLiveDurableObject {
  private saved?: SavedSession;
  private socket?: WebSocket;
  private provider?: Session;
  private connecting = false;
  private stopping = false;
  private paused = false;
  private generation = 0;
  private retry = 0;
  private queue = Promise.resolve();
  private userText = '';
  private modelText = '';
  private archive: LiveTurnArchive;
  private audioBatcher?: LiveAudioBatcher;
  private lastPersistAt = 0;
  private lastCheckpointRequestAt = 0;
  private inputWindow = { start: 0, bytes: 0 };
  private actions = new LiveActions();
  private incoming = new LiveActions();
  private registryQueue: LiveRegistryQueue;
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: LiveEnvironment,
    private readonly providerFactory = connectLiveProvider
  ) {
    this.archive = new LiveTurnArchive(state.storage);
    this.registryQueue = new LiveRegistryQueue(state.storage, env);
    state.blockConcurrencyWhile(async () => {
      this.saved = await state.storage.get<SavedSession>('session');
      if (this.saved)
        this.saved.reviews = (this.saved.reviews ?? []).flatMap((review) => {
          const parsed = proposalSchema.safeParse(review);
          return parsed.success ? [parsed.data] : [];
        });
      if (this.saved && !this.saved.ended && this.saved.billing) {
        this.saved.coverageGap = true;
        this.saved.billing.incomplete = true;
      }
      if (
        this.saved?.reviews.some((review) => review.status === 'processing')
      ) {
        await expireWorkspaceReviews(
          this.saved,
          this.provider,
          () => this.persist(),
          (event) => this.emit(event)
        );
        for (const review of this.saved.reviews)
          if (
            review.status === 'processing' &&
            review.name !== 'workspace_tool'
          )
            review.status = 'failed';
        this.saved.handle = undefined;
        await this.persist();
      }
    });
  }
  private emit(event: LiveAssistantEvent) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(event));
  }
  private persist() {
    return this.state.storage.put('session', this.saved);
  }
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/registry/') && request.method === 'POST')
      return this.registryQueue.fetch(request);
    if (path === '/workspace-review' && request.method === 'POST') {
      const input = (await request.json()) as Parameters<
        typeof controlWorkspaceReview
      >[0];
      const result = this.queue.then(() =>
        controlWorkspaceReview(
          input,
          this.saved,
          this.provider,
          () => this.persist(),
          (event) => this.emit(event)
        )
      );
      this.queue = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    }
    if (path === '/initialize' && request.method === 'POST') {
      if (this.saved)
        return new Response('Already initialized', { status: 409 });
      const input = (await request.json()) as Pick<
        SavedSession,
        | 'claims'
        | 'identity'
        | 'timezone'
        | 'sharedContext'
        | 'workspace'
        | 'voice'
      >;
      this.saved = {
        ...input,
        startedAt: Date.now(),
        journal: structuredClone(EMPTY_LIVE_JOURNAL),
        reviews: [],
      };
      await this.persist();
      await this.state.storage.setAlarm(Date.now() + 60_000);
      return Response.json({ ok: true });
    }
    if (path === '/control' && request.method === 'POST') {
      const input = (await request.json()) as {
        ownerId: string;
        meetingId: string;
        action: string;
      };
      if (!this.saved) return new Response('Session absent', { status: 410 });
      if (
        input.ownerId !== this.saved.claims.ownerId ||
        input.meetingId !== this.saved.claims.meetingId
      )
        return new Response('Forbidden', { status: 403 });
      if (input.action === 'stop') {
        await this.stop();
        return Response.json({ ok: true });
      }
      if (this.saved.ended)
        return new Response('Session ended', { status: 410 });
      return Response.json(this.saved.claims);
    }
    const protocols =
      request.headers
        .get('Sec-WebSocket-Protocol')
        ?.split(',')
        .map((v) => v.trim()) ?? [];
    const raw = protocols.find((v) => v.startsWith('auth.'))?.slice(5) ?? '';
    const claims = verifyLiveSession(raw, this.env.MEET_REALTIME_TOKEN_SECRET);
    const saved = this.saved;
    if (
      !saved ||
      !claims ||
      saved.ended ||
      claims.sessionId !== saved.claims.sessionId ||
      claims.ownerId !== saved.claims.ownerId ||
      claims.meetingId !== saved.claims.meetingId ||
      claims.mode !== saved.claims.mode
    )
      return new Response('Unauthorized', { status: 401 });
    if (
      request.headers.get('Origin') !== this.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get('Upgrade') !== 'websocket'
    )
      return new Response('Forbidden', { status: 403 });
    await liveRoomCommand(this.env, saved.claims, saved.identity, {
      action: 'live.context',
    });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.socket?.close(4001, 'Session moved');
    this.socket = server;
    server.accept();
    server.addEventListener('message', (event) => {
      if (server !== this.socket) return;
      this.queue = this.queue
        .then(() => this.command(event.data))
        .catch(() =>
          this.emit({ type: 'state', state: 'error', detail: 'request_failed' })
        );
    });
    server.addEventListener('close', (event) => {
      if (server !== this.socket) return;
      this.socket = undefined;
      if (event.code === 1000) {
        this.state.waitUntil(this.stop());
        return;
      }
      this.paused = true;
      this.provider?.sendRealtimeInput({ audioStreamEnd: true });
      void this.state.storage.setAlarm(Date.now() + 30_000);
    });
    this.paused = false;
    this.emit({
      type: 'state',
      state: this.provider ? 'listening' : 'connecting',
    });
    const history = this.queue.then(async () => {
      this.emit({
        type: 'history',
        turns: await this.archive.recent(this.userText, this.modelText),
      });
    });
    this.queue = history.catch(() => undefined);
    await history;
    for (const review of saved.reviews) this.emitReview(review);
    this.state.waitUntil(this.connect());
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { 'Sec-WebSocket-Protocol': 'meet-live' },
    });
  }
  private async connect() {
    const saved = this.saved;
    if (
      !saved ||
      saved.ended ||
      this.connecting ||
      this.provider ||
      !this.socket
    )
      return;
    this.connecting = true;
    const generation = ++this.generation;
    try {
      if (!saved.billing) {
        saved.billing = await beginLiveBilling(
          this.env,
          saved.claims,
          0,
          saved.identity.workspaceId
        );
        await this.persist();
      }
      await reportLiveUsage(
        this.env,
        saved.claims,
        saved.identity,
        saved.billing
      );
      const handle = saved.toolResponses?.length ? undefined : saved.handle;
      if (!handle) saved.searchTurn = undefined;
      const provider = await this.providerFactory({
        env: this.env,
        claims: saved.claims,
        timezone: saved.timezone,
        voice: saved.voice,
        sharedContext: saved.sharedContext,
        journal: saved.journal,
        workspaceTools: saved.workspace?.tools,
        handle,
        onMessage: (message) => {
          if (generation !== this.generation) return;
          observeSessionUsage(saved, message);
          if (message.serverContent?.turnComplete)
            saved.toolResponses = saved.toolResponses?.filter(
              (item) => !item.deliveredAt
            );
          if (!this.stopping)
            this.queue = this.queue
              .then(() => this.incoming.run(() => this.message(message)))
              .catch(() => this.stop('processing_failed'));
        },
        onClose: () => {
          if (generation === this.generation && !this.stopping) {
            markInterruptedUsage(saved);
            this.provider = undefined;
            this.emit({ type: 'state', state: 'recovering' });
            void this.state.storage.setAlarm(
              Date.now() + Math.min(1000 * 2 ** this.retry++, 15000)
            );
          }
        },
      });
      if (generation !== this.generation || saved.ended) {
        provider.close();
        return;
      }
      replayLiveToolResponses(saved, provider);
      this.provider = provider;
      this.retry = 0;
      this.emit({ type: 'state', state: this.paused ? 'paused' : 'listening' });
      await this.state.storage.setAlarm(Date.now() + 20_000);
    } catch {
      if (this.retry >= 2 && saved.handle) {
        saved.handle = undefined;
        saved.coverageGap = true;
        if (saved.billing) saved.billing.incomplete = true;
        await this.persist();
      }
      this.emit({
        type: 'state',
        state: 'recovering',
        detail: 'provider_unavailable',
      });
      if (++this.retry > 8) await this.stop('connection_failed');
      else
        await this.state.storage.setAlarm(
          Date.now() + Math.min(1000 * 2 ** this.retry, 15000)
        );
    } finally {
      this.connecting = false;
    }
  }
  private async command(raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 40000) return;
    const parsed = liveClientCommandSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || !this.saved || this.saved.ended) return;
    const message = parsed.data;
    if (message.type === 'stop') {
      await this.stop();
      return;
    }
    if (message.type === 'decision') {
      await this.decide(message.id, message.approved, message.text);
      return;
    }
    if (message.type === 'pause') {
      this.paused = message.paused;
      if (this.paused) {
        this.provider?.sendRealtimeInput({ audioStreamEnd: true });
        await this.interruptAudio();
      }
      this.emit({ type: 'state', state: this.paused ? 'paused' : 'listening' });
      return;
    }
    if (!this.provider) return;
    if (message.type === 'text')
      this.provider.sendRealtimeInput({ text: message.text });
    if (message.type === 'audio') {
      if (this.paused) return;
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(message.data)) return;
      if (Date.now() - this.inputWindow.start >= 1000)
        this.inputWindow = { start: Date.now(), bytes: 0 };
      this.inputWindow.bytes += message.data.length;
      if (this.inputWindow.bytes > 90000) return;
      this.provider.sendRealtimeInput({
        audio: { data: message.data, mimeType: 'audio/pcm;rate=16000' },
      });
    }
  }
  private async message(message: LiveServerMessage) {
    const saved = this.saved;
    if (!saved || saved.ended) return;
    if (
      message.sessionResumptionUpdate?.resumable &&
      message.sessionResumptionUpdate.newHandle
    )
      saved.handle = message.sessionResumptionUpdate.newHandle;
    const cancelledIds = message.toolCallCancellation?.ids ?? [];
    for (const review of saved.reviews) {
      if (review.status === 'pending' && cancelledIds.includes(review.callId)) {
        review.status = 'denied';
        this.emitReview(review);
      }
    }
    if (cancelledIds.length) await this.persist();
    const content = message.serverContent;
    if (content?.interrupted) {
      await this.interruptAudio();
    }
    if (content?.inputTranscription?.text) {
      this.userText = (this.userText + content.inputTranscription.text).slice(
        -32000
      );
      this.emit({
        type: 'transcript',
        role: 'user',
        text: content.inputTranscription.text,
      });
    }
    if (content?.outputTranscription?.text) {
      this.modelText = (
        this.modelText + content.outputTranscription.text
      ).slice(-32000);
      this.emit({
        type: 'transcript',
        role: 'assistant',
        text: content.outputTranscription.text,
      });
    }
    for (const part of content?.modelTurn?.parts ?? []) {
      if (
        !this.paused &&
        part.inlineData?.data &&
        part.inlineData.mimeType?.startsWith('audio/pcm')
      ) {
        if (saved.claims.mode === 'personal')
          this.emit({
            type: 'audio',
            data: part.inlineData.data,
            sampleRate: 24000,
          });
        else {
          this.audioBatcher ??= createRoomLiveAudioBatcher(
            this.env,
            saved,
            (event) => this.emit(event)
          );
          this.audioBatcher.push(part.inlineData.data);
        }
      }
    }
    if (content?.turnComplete) {
      for (const [role, text] of [
        ['user', this.userText],
        ['assistant', this.modelText],
      ] as const) {
        if (!text.trim()) continue;
        const turn = { role, text, at: new Date().toISOString() };
        const sequence = await this.archive.append(turn);
        saved.journal = appendLiveTurn(saved.journal, { ...turn, sequence });
        this.emit({ type: 'transcript', role, text: '', finished: true });
      }
      this.userText = '';
      this.modelText = '';
      if (
        needsLiveCheckpoint(saved.journal) &&
        Date.now() - this.lastCheckpointRequestAt > 120000
      ) {
        this.lastCheckpointRequestAt = Date.now();
        this.provider?.sendRealtimeInput({
          text: 'Organize earlier session context now using organize_context. Include a rolling summary of prior checkpoints. Do not speak this housekeeping request aloud.',
        });
      }
    }
    for (const call of message.toolCall?.functionCalls ?? [])
      await executeLiveTool(
        {
          saved,
          provider: this.provider,
          env: this.env,
          archive: this.archive,
          persist: () => this.persist(),
          emit: (event) => this.emit(event),
          emitReview: (review) => this.emitReview(review),
        },
        call.id ?? '',
        call.name ?? '',
        call.args ?? {}
      );
    if (
      message.usageMetadata ||
      message.sessionResumptionUpdate?.newHandle ||
      content?.turnComplete ||
      Date.now() - this.lastPersistAt > 10000
    ) {
      await this.persist();
      this.lastPersistAt = Date.now();
    }
    if (message.goAway) {
      markInterruptedUsage(saved);
      ++this.generation;
      this.provider?.close();
      this.provider = undefined;
      this.emit({ type: 'state', state: 'recovering' });
      await this.connect();
    }
  }
  private async interruptAudio() {
    const sequence = this.audioBatcher?.clear();
    this.emit({ type: 'interrupt' });
    if (this.saved?.claims.mode === 'room')
      await liveRoomCommand(this.env, this.saved.claims, this.saved.identity, {
        action: 'live.interrupt',
        sequence,
        sessionId: this.saved.claims.sessionId,
      }).catch(() => undefined);
  }
  private emitReview(review: LiveProposal) {
    this.emit(liveReviewEvent(review));
  }
  private async decide(id: string, approved: boolean, text?: string) {
    const saved = this.saved!;
    if (
      !approved &&
      (await dismissFailedLiveReview(saved, id, () => this.persist()))
    )
      return;
    const review = saved.reviews.find((item) => item.id === id);
    if (review?.status !== 'pending' || review.name === 'workspace_tool')
      return;
    if (review.expiresAt < Date.now()) approved = false;
    if (approved && text?.trim())
      review.text = text
        .trim()
        .slice(0, review.name === 'remember' ? 1000 : 4000);
    review.status = approved ? 'processing' : 'denied';
    await this.persist();
    this.emitReview(review);
    this.state.waitUntil(
      this.actions.run(() => this.executeDecision(review, approved))
    );
  }
  private async executeDecision(review: LiveProposal, approved: boolean) {
    await executeLiveDecision(
      this.saved!,
      this.env,
      review,
      approved,
      this.actions.signal,
      () => this.provider,
      () => this.persist(),
      () => this.state.storage.setAlarm(Date.now() + 20000)
    );
    this.emitReview(review);
  }
  alarm() {
    this.queue = this.queue
      .then(() => this.tick())
      .catch(() => this.stop('session_unavailable'));
    return this.queue;
  }
  private async tick() {
    if (!this.saved) return;
    if (this.saved.ended) {
      await this.finalizeBilling();
      return;
    }
    if (!this.socket) {
      await this.stop();
      return;
    }
    await settlePublicBillings(
      this.env,
      this.saved,
      () => this.persist(),
      () => this.state.storage.setAlarm(Date.now() + 20000)
    );
    await expireWorkspaceReviews(
      this.saved,
      this.provider,
      () => this.persist(),
      (event) => this.emit(event)
    );
    for (const review of this.saved.reviews)
      if (review.status === 'pending' && review.expiresAt <= Date.now()) {
        if (review.name === 'workspace_tool')
          await controlWorkspaceReview(
            {
              ownerId: this.saved.claims.ownerId,
              meetingId: this.saved.claims.meetingId,
              reviewId: review.id,
              action: 'deny',
            },
            this.saved,
            this.provider,
            () => this.persist(),
            (event) => this.emit(event)
          );
        else await this.decide(review.id, false);
      }
    try {
      await maintainLiveRegistry(this.env, this.saved);
      if (this.saved.ended) return;
      await liveRoomCommand(this.env, this.saved.claims, this.saved.identity, {
        action:
          this.saved.claims.mode === 'room' ? 'live.heartbeat' : 'live.context',
        sessionId: this.saved.claims.sessionId,
      });
      if (this.saved.billing) {
        const result = await settleLiveBilling(
          this.env,
          this.saved.claims,
          this.saved.billing,
          false
        );
        this.saved.billing = result;
        await this.persist();
        await reportLiveUsage(
          this.env,
          this.saved.claims,
          this.saved.identity,
          result
        );
        this.emit({
          type: 'usage',
          costUsd: result.costUsd,
          incomplete: result.incomplete,
        });
        if (result.closed || result.exhausted) {
          await this.stop('quota_exhausted');
          return;
        }
        if (result.renew) {
          this.saved.billing = await settleLiveBilling(
            this.env,
            this.saved.claims,
            result,
            true
          );
          await this.persist();
          await reportLiveUsage(
            this.env,
            this.saved.claims,
            this.saved.identity,
            this.saved.billing
          );
          this.saved.billingFinalized = true;
          await this.persist();
          this.saved.billing = await beginLiveBilling(
            this.env,
            this.saved.claims,
            this.saved.billing.costUsd,
            this.saved.identity.workspaceId
          );
          this.saved.coverageGap = false;
          this.saved.billingFinalized = false;
          await this.persist();
          await reportLiveUsage(
            this.env,
            this.saved.claims,
            this.saved.identity,
            this.saved.billing
          );
        }
      }
      if (this.saved.toolResponses?.some((item) => !item.deliveredAt)) {
        this.provider?.close();
        this.provider = undefined;
        this.saved.handle = undefined;
      }
      if (!this.provider) await this.connect();
      await this.state.storage.setAlarm(Date.now() + 20_000);
    } catch {
      await this.stop('session_unavailable');
    }
  }
  private async stop(detail?: string) {
    if (!this.saved || this.stopping) return;
    this.stopping = true;
    this.paused = true;
    const actionsSettled = this.actions.cancel();
    const messagesSettled = this.incoming.cancel();
    this.audioBatcher?.clear();
    await drainLiveProvider(this.provider);
    markInterruptedUsage(this.saved);
    ++this.generation;
    this.provider = undefined;
    await actionsSettled;
    await messagesSettled;
    this.saved.ended = true;
    await this.persist();
    await this.finalizeBilling();
    this.emit({ type: 'state', state: detail ? 'error' : 'ended', detail });
    this.socket?.close(1000, 'Session ended');
    this.socket = undefined;
  }
  private async finalizeBilling() {
    if (!this.saved) return;
    this.state.waitUntil(
      cleanupEndedLiveSession(
        this.env,
        this.saved,
        () => this.persist(),
        () => this.state.storage.setAlarm(Date.now() + 60000)
      )
    );
    await finalizeSessionBilling(
      this.env,
      this.saved,
      () => this.persist(),
      () => this.state.storage.setAlarm(Date.now() + 60000),
      this.state.storage
    );
  }
}
