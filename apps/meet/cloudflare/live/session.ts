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
import { LiveAudioBatcher } from './audio-batcher';
import { beginLiveBilling, settleLiveBilling } from './billing';
import {
  finalizeSessionBilling,
  settlePublicBillings,
} from './finalize-billing';
import { connectLiveProvider, drainLiveProvider } from './provider';
import { speakApprovedText } from './public-speech';
import { LiveRegistryQueue } from './registry';
import { refreshLiveRegistry } from './registry-heartbeat';
import {
  approveLiveMemory,
  type LiveProposal,
  liveReviewEvent,
} from './reviews';
import { liveRoomCommand } from './room';
import type { SavedSession } from './session-state';
import { executeLiveTool } from './session-tools';
import { markInterruptedUsage, observeSessionUsage } from './session-usage';
import { type LiveEnvironment, LiveTurnArchive } from './storage';
import { reportLiveUsage } from './usage-report';
import { controlWorkspaceReview } from './workspace-review';

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
  private lastRegistryAt = 0;
  private lastCheckpointRequestAt = 0;
  private inputWindow = { start: 0, bytes: 0 };
  private actions = new LiveActions();
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
      if (this.saved && !this.saved.ended && this.saved.billing) {
        this.saved.coverageGap = true;
        this.saved.billing.incomplete = true;
      }
      if (
        this.saved?.reviews.some((review) => review.status === 'processing')
      ) {
        for (const review of this.saved.reviews)
          if (review.status === 'processing') review.status = 'failed';
        // Never replay an interrupted action from a resumed tool call.
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
      if (
        !this.saved ||
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
    this.emit({
      type: 'history',
      turns: await this.archive.recent(this.userText, this.modelText),
    });
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
        saved.billing = await beginLiveBilling(this.env, saved.claims);
        await this.persist();
      }
      await reportLiveUsage(
        this.env,
        saved.claims,
        saved.identity,
        saved.billing
      );
      const provider = await this.providerFactory({
        env: this.env,
        claims: saved.claims,
        timezone: saved.timezone,
        voice: saved.voice,
        sharedContext: saved.sharedContext,
        journal: saved.journal,
        workspaceTools: saved.workspace?.tools,
        handle: saved.handle,
        onMessage: (message) => {
          if (generation !== this.generation) return;
          observeSessionUsage(saved, message);
          if (!this.stopping)
            this.queue = this.queue
              .then(() => this.message(message))
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
          this.audioBatcher ??= new LiveAudioBatcher(
            (data, sequence, at) =>
              liveRoomCommand(this.env, saved.claims, saved.identity, {
                action: 'live.audio',
                sessionId: saved.claims.sessionId,
                data,
                sequence,
                at,
              }),
            () =>
              this.emit({
                type: 'state',
                state: 'recovering',
                detail: 'audio_delivery_interrupted',
              })
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
        await this.archive.append(turn);
        saved.journal = appendLiveTurn(saved.journal, turn);
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
    this.audioBatcher?.clear();
    this.emit({ type: 'interrupt' });
    if (this.saved?.claims.mode === 'room')
      await liveRoomCommand(this.env, this.saved.claims, this.saved.identity, {
        action: 'live.interrupt',
        sessionId: this.saved.claims.sessionId,
      }).catch(() => undefined);
  }
  private emitReview(review: LiveProposal) {
    this.emit(liveReviewEvent(review));
  }
  private async decide(id: string, approved: boolean, text?: string) {
    const saved = this.saved!;
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
    const saved = this.saved!;
    try {
      if (approved && review.name === 'remember')
        await approveLiveMemory(this.env, saved.claims, review);
      if (approved && review.name === 'propose_room_reply')
        await speakApprovedText(
          this.env,
          saved.claims,
          saved.identity,
          review.id,
          review.text,
          this.actions.signal,
          async (billing, finalized) => {
            saved.publicBillings ??= {};
            if (finalized) delete saved.publicBillings[review.id];
            else saved.publicBillings[review.id] = billing;
            await this.persist();
            await this.state.storage.setAlarm(Date.now() + 20000);
          }
        );
      review.status = approved ? 'approved' : 'denied';
      this.provider?.sendToolResponse({
        functionResponses: [
          {
            id: review.callId,
            name: review.name,
            response: { approved, completed: approved },
          },
        ],
      });
    } catch {
      review.status = 'failed';
      this.provider?.sendToolResponse({
        functionResponses: [
          {
            id: review.callId,
            name: review.name,
            response: {
              error:
                'Approved action could not be completed. Do not claim success or retry without another request.',
            },
          },
        ],
      });
    }
    await this.persist();
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
      if (Date.now() - this.lastRegistryAt > 12 * 60 * 60_000) {
        await refreshLiveRegistry(this.env, this.saved.claims);
        this.lastRegistryAt = Date.now();
        if (this.saved.ended) return;
      }
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
            this.saved.billing.costUsd
          );
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
    this.audioBatcher?.clear();
    await drainLiveProvider(this.provider);
    markInterruptedUsage(this.saved);
    ++this.generation;
    this.provider = undefined;
    await actionsSettled;
    this.saved.ended = true;
    await this.persist();
    this.state.waitUntil(
      this.env.MEET_LIVE.get(
        this.env.MEET_LIVE.idFromName(`owner:${this.saved.claims.ownerId}`)
      )
        .fetch('https://live.internal/registry/remove', {
          method: 'POST',
          body: JSON.stringify(this.saved.claims),
        })
        .catch(() => undefined)
    );
    if (this.saved.claims.mode === 'room')
      await liveRoomCommand(this.env, this.saved.claims, this.saved.identity, {
        action: 'live.stop',
        sessionId: this.saved.claims.sessionId,
      }).catch(() => undefined);
    await this.finalizeBilling();
    this.emit({ type: 'state', state: detail ? 'error' : 'ended', detail });
    this.socket?.close(1000, 'Session ended');
    this.socket = undefined;
  }
  private async finalizeBilling() {
    if (!this.saved) return;
    await finalizeSessionBilling(
      this.env,
      this.saved,
      () => this.persist(),
      () => this.state.storage.setAlarm(Date.now() + 60000),
      this.state.storage
    );
  }
}
