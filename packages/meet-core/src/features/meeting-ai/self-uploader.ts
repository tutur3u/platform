import { encodeMeetWav } from './audio';
import {
  classifySelfFailure,
  type SelfCaptureApi,
  type SelfFailure,
} from './self-api';
import { SELF_SAMPLE_RATE, type SelfChunk } from './self-chunker';

/** At most this much audio waits on a device, including the chunk in flight. */
export const SELF_PENDING_MAX_SAMPLES = 60 * SELF_SAMPLE_RATE;
const MAX_ATTEMPTS = 3;

type Queued = {
  id: string;
  sequence: number;
  startSample: number;
  samples: number;
  audio: Blob;
  attempts: number;
};

export type SelfUploaderHooks = {
  /** A refusal or ineligibility: capture must stop and everything is dropped. */
  onFailure: (failure: Exclude<SelfFailure, 'retry'>) => void;
};

/**
 * One upload in flight, a bounded in-memory queue and no persistence. A
 * refused chunk drops the whole queue and stops; a transient failure retries
 * the same chunk id a few times, then drops only that chunk.
 */
export class SelfUploader {
  private queue: Queued[] = [];
  private busy = false;
  private pending = 0;
  private sequence = 0;
  private stopped = false;
  private abort = new AbortController();
  private timer: ReturnType<typeof setTimeout> | null = null;
  droppedForCap = 0;

  constructor(
    private readonly api: SelfCaptureApi,
    private readonly grant: {
      sessionId: string;
      streamId: string;
      consentRevision: number;
    },
    private readonly hooks: SelfUploaderHooks,
    private readonly newId: () => string = () => crypto.randomUUID()
  ) {}

  get pendingSamples() {
    return this.pending;
  }

  enqueue(chunk: SelfChunk) {
    if (this.stopped) return false;
    if (this.pending + chunk.samples.length > SELF_PENDING_MAX_SAMPLES) {
      this.droppedForCap++;
      return false;
    }
    this.pending += chunk.samples.length;
    this.queue.push({
      id: this.newId(),
      sequence: this.sequence++,
      startSample: chunk.startSample,
      samples: chunk.samples.length,
      audio: encodeMeetWav(chunk.samples),
      attempts: 0,
    });
    void this.pump();
    return true;
  }

  /** Drop everything queued and abort the request in flight. */
  stop() {
    this.stopped = true;
    this.queue = [];
    this.pending = 0;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.abort.abort();
  }

  private async pump() {
    if (this.busy || this.stopped || this.timer) return;
    const chunk = this.queue[0];
    if (!chunk) return;
    this.busy = true;
    chunk.attempts++;
    try {
      await this.api.upload(
        {
          ...this.grant,
          id: chunk.id,
          sequence: chunk.sequence,
          startSample: chunk.startSample,
          audio: chunk.audio,
        },
        this.abort.signal
      );
      this.finish(chunk);
    } catch (error) {
      if (this.stopped) return;
      const failure = classifySelfFailure(error);
      if (failure !== 'retry') {
        this.stop();
        this.hooks.onFailure(failure);
        return;
      }
      if (chunk.attempts >= MAX_ATTEMPTS) this.finish(chunk);
      else this.retryLater(chunk.attempts * 1000);
    } finally {
      this.busy = false;
    }
    void this.pump();
  }

  private finish(chunk: Queued) {
    if (this.queue[0] !== chunk) return;
    this.queue.shift();
    this.pending -= chunk.samples;
  }

  private retryLater(ms: number) {
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.pump();
    }, ms);
  }
}
