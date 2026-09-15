import {
  MEET_AUDIO_BATCH_INTERVAL_MS,
  MEET_AUDIO_BATCH_MAX_BYTES,
  MEET_AUDIO_BATCH_MAX_CLIPS,
} from '@tuturuuu/ai/meetings/audio-contract';
import type { MeetAudioSource } from './audio';

export type MeetAudioClip = Omit<MeetAudioSource, 'stream'> & {
  audio: Blob;
  startSeconds: number;
};

/** One reservation per upload window, regardless of how many microphones are audible. */
export class MeetAudioBatcher {
  private clips: MeetAudioClip[] = [];
  private bytes = 0;
  private closed = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(
    private send: (clips: MeetAudioClip[]) => void,
    private overflow: () => void
  ) {}
  start() {
    this.closed = false;
    // Allow the worklet's first ten-second buffers to arrive before the first drain.
    this.timer = setTimeout(() => {
      this.flush();
      if (this.timer)
        this.timer = setInterval(
          () => this.flush(),
          MEET_AUDIO_BATCH_INTERVAL_MS
        );
    }, MEET_AUDIO_BATCH_INTERVAL_MS + 100);
  }
  add(clip: MeetAudioClip) {
    if (this.closed) return;
    if (
      this.clips.length >= MEET_AUDIO_BATCH_MAX_CLIPS ||
      this.bytes + clip.audio.size > MEET_AUDIO_BATCH_MAX_BYTES
    ) {
      this.flush();
      if (!this.closed) {
        this.dispose();
        this.overflow();
      }
      return;
    }
    this.clips.push(clip);
    this.bytes += clip.audio.size;
  }
  flush() {
    if (this.closed || !this.clips.length) return;
    const clips = this.clips;
    this.clips = [];
    this.bytes = 0;
    this.send(clips);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.flush();
    this.closed = true;
  }
  dispose() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.clips = [];
    this.bytes = 0;
  }
}
