import { classifySelfFailure, type SelfCaptureApi } from './self-api';
import { SELF_FRAME_SAMPLES, SelfChunker } from './self-chunker';
import {
  createSelfEngine,
  type SelfEngine,
  type SelfEngineFactory,
} from './self-engine';
import {
  nextSelfLifecycle,
  SELF_RATE_LIMIT_MS,
  SELF_RENEW_MS,
  SELF_RETRY_MS,
  type SelfCaptureState,
  type SelfLifecycle,
  type SelfLifecycleEvent,
  selfCaptureViewOf,
} from './self-lifecycle';
import { hasConfirmedEchoCancellation, ownMicrophoneTrack } from './self-mic';
import { SelfUploader } from './self-uploader';

export type SelfCaptureInputs = {
  mode: 'room' | 'self';
  session: { sessionId: string; protocol: 'legacy' | 'self_v1' } | null;
  /** This participant's own transcript choice is Allow. */
  allow: boolean;
  /** This participant's Mira choice is on. */
  miraOn: boolean;
  connected: boolean;
  guest: boolean;
  /** The local call stream; never remote, screen or assistant audio. */
  stream: MediaStream | null;
  /** Changes on every rejoin so a refused participant can open again. */
  joinEpoch: number;
};

export const SELF_IDLE_INPUTS: SelfCaptureInputs = {
  mode: 'room',
  session: null,
  allow: false,
  miraOn: false,
  connected: false,
  guest: false,
  stream: null,
  joinEpoch: 0,
};

type Deps = {
  api: SelfCaptureApi;
  engine?: SelfEngineFactory;
  now?: () => number;
  newId?: () => string;
};

const AEC_CHECK_FRAMES = 25;

/**
 * Per-speaker capture for the local microphone. It opens a stream only while
 * the server reports a per-speaker session and this participant has allowed
 * it, taps nothing before that, and drops all buffered audio on any stop.
 */
export class SelfCaptureController {
  private inputs = SELF_IDLE_INPUTS;
  private lifecycle: SelfLifecycle = { kind: 'idle' };
  private override: SelfCaptureState | null = { kind: 'off' };
  private view: SelfCaptureState = { kind: 'off' };
  private listeners = new Set<() => void>();
  private token = 0;
  private opening = false;
  private engine: SelfEngine | null = null;
  private track: MediaStreamTrack | null = null;
  private chunker: SelfChunker | null = null;
  private uploader: SelfUploader | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private backoff: ReturnType<typeof setTimeout> | null = null;
  private frames = 0;
  private readonly api: SelfCaptureApi;
  private readonly makeEngine: SelfEngineFactory;
  private readonly now: () => number;
  private readonly newId?: () => string;

  constructor(deps: Deps) {
    this.api = deps.api;
    this.makeEngine = deps.engine ?? createSelfEngine;
    this.now = deps.now ?? Date.now;
    this.newId = deps.newId;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  getState = () => this.view;

  update(inputs: SelfCaptureInputs) {
    this.inputs = inputs;
    const own = ownMicrophoneTrack(inputs.stream);
    const eligible =
      inputs.mode === 'self' &&
      inputs.session?.protocol === 'self_v1' &&
      inputs.allow &&
      inputs.miraOn;
    if (!eligible || !inputs.session) return this.halt({ kind: 'off' });
    if (inputs.guest) return this.halt({ kind: 'guest' });
    if (!own) return this.halt({ kind: 'off' });
    if (!hasConfirmedEchoCancellation(own))
      return this.halt({ kind: 'unsupported' });
    if (!inputs.connected) return this.halt({ kind: 'paused' });
    this.override = null;
    if (this.engine && own && own !== this.track) {
      this.track = own;
      this.engine.swapTrack(own);
    }
    this.dispatch({
      type: 'eligible',
      key: `${inputs.session.sessionId}:${inputs.joinEpoch}`,
    });
  }

  /** Stop and drop everything; the controller can be updated again after. */
  dispose() {
    this.halt({ kind: 'off' });
  }

  /** Stop everything, drop buffered audio and show a fixed state. */
  private halt(state: SelfCaptureState) {
    this.override = state;
    this.openAttempts = 0;
    this.lifecycle = nextSelfLifecycle(this.lifecycle, { type: 'ineligible' });
    this.stopCapture();
    this.publish();
  }

  private dispatch(event: SelfLifecycleEvent) {
    const prev = this.lifecycle;
    this.lifecycle = nextSelfLifecycle(prev, event);
    const next = this.lifecycle;
    const leftStream = prev.kind === 'open' && next.kind !== 'open';
    const newKey = 'key' in prev && 'key' in next && prev.key !== next.key;
    if (leftStream || newKey) this.stopCapture();
    if (this.lifecycle.kind === 'opening') void this.open();
    if (this.lifecycle.kind === 'backoff') this.scheduleReopen();
    this.publish();
  }

  private publish() {
    const next = this.override ?? selfCaptureViewOf(this.lifecycle);
    if (next.kind === this.view.kind) return;
    this.view = next;
    for (const listener of [...this.listeners]) listener();
  }

  private stopCapture() {
    this.token++;
    this.opening = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.backoff) clearTimeout(this.backoff);
    this.timer = this.backoff = null;
    this.uploader?.stop();
    this.chunker?.discard();
    this.engine?.dispose();
    this.uploader = this.chunker = this.engine = this.track = null;
    this.frames = 0;
  }

  private openAttempts = 0;
  private openDelay = SELF_RETRY_MS;

  private async open() {
    const session = this.inputs.session;
    if (this.opening || !session) return;
    this.opening = true;
    const token = this.token;
    try {
      const grant = await this.api.open({ sessionId: session.sessionId });
      if (token !== this.token) return;
      this.opening = false;
      this.openAttempts = 0;
      this.dispatch({
        type: 'opened',
        streamId: grant.streamId,
        consentRevision: grant.consentRevision,
        leaseExpiresAt: this.leaseAt(grant.leaseExpiresAt),
      });
      await this.startCapture(session.sessionId, token);
    } catch (error) {
      if (token !== this.token) return;
      this.opening = false;
      this.failedOpen(error);
    }
  }

  private failedOpen(error: unknown) {
    const failure = classifySelfFailure(error);
    const attempt = this.openAttempts++;
    this.openDelay = isRateLimit(error)
      ? SELF_RATE_LIMIT_MS
      : Math.min(SELF_RETRY_MS * (attempt + 1), SELF_RATE_LIMIT_MS);
    this.dispatch({ type: 'open_failed', failure, attempt });
  }

  /** A malformed lease falls back to the 60-second server lease. */
  private leaseAt(value: string) {
    const at = Date.parse(value);
    return Number.isFinite(at) ? at : this.now() + 60_000;
  }

  private scheduleReopen() {
    if (this.backoff) return;
    this.backoff = setTimeout(() => {
      this.backoff = null;
      this.dispatch({ type: 'backoff_elapsed' });
    }, this.openDelay);
  }

  /** Taps the microphone only now, after the server accepted the stream. */
  private async startCapture(sessionId: string, token: number) {
    const lifecycle = this.lifecycle;
    const own = ownMicrophoneTrack(this.inputs.stream);
    if (lifecycle.kind !== 'open' || !own || !hasConfirmedEchoCancellation(own))
      return;
    this.track = own;
    this.uploader = new SelfUploader(
      this.api,
      {
        sessionId,
        streamId: lifecycle.streamId,
        consentRevision: lifecycle.consentRevision,
      },
      {
        onFailure: (failure) => this.dispatch({ type: 'refused', failure }),
      },
      this.newId
    );
    const uploader = this.uploader;
    this.chunker = new SelfChunker((chunk) => uploader.enqueue(chunk));
    this.scheduleRenew(token);
    try {
      const engine = await this.makeEngine(own, (frame) => this.onFrame(frame));
      if (token !== this.token) return engine.dispose();
      this.engine = engine;
    } catch {
      if (token === this.token) this.halt({ kind: 'unsupported' });
    }
  }

  private onFrame(frame: Float32Array) {
    if (frame.length !== SELF_FRAME_SAMPLES) return;
    this.chunker?.push(frame);
    if (++this.frames % AEC_CHECK_FRAMES === 0) this.update(this.inputs);
  }

  private scheduleRenew(token: number) {
    const lifecycle = this.lifecycle;
    const delay =
      lifecycle.kind === 'open' && lifecycle.degraded
        ? SELF_RETRY_MS
        : SELF_RENEW_MS;
    this.timer = setTimeout(() => void this.renew(token), delay);
  }

  private async renew(token: number) {
    const lifecycle = this.lifecycle;
    const session = this.inputs.session;
    if (token !== this.token || lifecycle.kind !== 'open' || !session) return;
    try {
      const result = await this.api.renew({
        sessionId: session.sessionId,
        streamId: lifecycle.streamId,
      });
      if (token !== this.token) return;
      this.dispatch({
        type: 'renewed',
        leaseExpiresAt: this.leaseAt(result.leaseExpiresAt),
      });
    } catch (error) {
      if (token !== this.token) return;
      this.dispatch({
        type: 'renew_failed',
        failure: classifySelfFailure(error),
        now: this.now(),
      });
    }
    if (token === this.token && this.lifecycle.kind === 'open')
      this.scheduleRenew(token);
  }
}

const isRateLimit = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (('code' in error && error.code === 'MEET_SELF_RATE_LIMITED') ||
    ('status' in error && error.status === 429));
