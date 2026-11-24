export const SELF_SAMPLE_RATE = 16_000;
export const SELF_FRAME_SAMPLES = 320;
/** The server accepts 1 to 10 seconds of 16 kHz mono PCM16. */
export const SELF_CHUNK_MAX_SAMPLES = 10 * SELF_SAMPLE_RATE;
export const SELF_MIN_SPEECH_FRAMES = 50;
const FLUSH_SILENCE_FRAMES = 100;
const HANGOVER_FRAMES = 15;
const PRE_ROLL_FRAMES = 5;
const MIN_SPEECH_ENERGY = 1e-5;
const FLOOR_RATIO = 3;
const MIN_FLOOR = 1e-8;
/** Background noise above this (RMS about 0.014) is treated as speech. */
const MAX_FLOOR = 2e-4;
/** The noise floor is a low percentile of the last five seconds of frames. */
const FLOOR_WINDOW = 250;
const FLOOR_PERCENTILE = 0.1;
const FLOOR_REFRESH_FRAMES = 5;

export type SelfChunk = {
  /** Samples since the capture timeline started, at the chunk's first sample. */
  startSample: number;
  samples: Float32Array;
  speechFrames: number;
};

/**
 * Voice activity chunker on 20 ms frames. Speech is energy above an adaptive
 * noise floor with a 300 ms hangover. A chunk flushes at 10 seconds or after
 * 2 seconds of silence, and is dropped when it holds under 1 second of speech.
 * Silent frames still advance the sample timeline, so mute gaps keep timing.
 */
export class SelfChunker {
  private floor = MIN_FLOOR;
  private energies = new Float64Array(FLOOR_WINDOW);
  private hang = 0;
  private frameIndex = 0;
  private preRoll: Float32Array[] = [];
  private open: Float32Array[] = [];
  private openStart = 0;
  private speechFrames = 0;
  private silentFrames = 0;
  dropped = 0;

  constructor(private readonly emit: (chunk: SelfChunk) => void) {}

  /** Frames seen so far; the next frame starts at this many samples. */
  get timeline() {
    return this.frameIndex * SELF_FRAME_SAMPLES;
  }

  push(frame: Float32Array) {
    if (frame.length !== SELF_FRAME_SAMPLES)
      throw new RangeError('Self capture frames hold 320 samples');
    let energy = 0;
    for (let i = 0; i < frame.length; i++) energy += frame[i]! ** 2;
    energy /= frame.length;
    const index = this.frameIndex++;
    this.energies[index % FLOOR_WINDOW] = energy;
    if (index % FLOOR_REFRESH_FRAMES === 0) this.refreshFloor(index + 1);
    const loud = energy > Math.max(MIN_SPEECH_ENERGY, this.floor * FLOOR_RATIO);
    const speaking = loud || this.hang > 0;
    this.hang = loud ? HANGOVER_FRAMES : Math.max(0, this.hang - 1);
    if (!this.open.length) {
      if (!speaking) {
        this.preRoll.push(frame);
        if (this.preRoll.length > PRE_ROLL_FRAMES) this.preRoll.shift();
        return;
      }
      this.open = [...this.preRoll, frame];
      this.openStart = (index - this.preRoll.length) * SELF_FRAME_SAMPLES;
      this.preRoll = [];
      this.speechFrames = loud ? 1 : 0;
      this.silentFrames = 0;
      return;
    }
    this.open.push(frame);
    if (loud) this.speechFrames++;
    this.silentFrames = speaking ? 0 : this.silentFrames + 1;
    if (
      this.open.length * SELF_FRAME_SAMPLES >= SELF_CHUNK_MAX_SAMPLES ||
      this.silentFrames >= FLUSH_SILENCE_FRAMES
    )
      this.flush();
  }

  private refreshFloor(seen: number) {
    const window = Array.from(
      this.energies.subarray(0, Math.min(seen, FLOOR_WINDOW))
    ).sort((a, b) => a - b);
    const low = window[Math.floor(window.length * FLOOR_PERCENTILE)];
    this.floor = Math.min(MAX_FLOOR, Math.max(MIN_FLOOR, low ?? MIN_FLOOR));
  }

  /** Emit or drop the open chunk, trimming the silence after the hangover. */
  flush() {
    const frames = this.open;
    if (!frames.length) return;
    const keep = Math.max(1, frames.length - this.silentFrames);
    const speech = this.speechFrames;
    const start = this.openStart;
    this.open = [];
    this.speechFrames = 0;
    this.silentFrames = 0;
    this.preRoll = [];
    if (speech < SELF_MIN_SPEECH_FRAMES) {
      this.dropped++;
      return;
    }
    const samples = new Float32Array(keep * SELF_FRAME_SAMPLES);
    frames.slice(0, keep).forEach((frame, i) => {
      samples.set(frame, i * SELF_FRAME_SAMPLES);
    });
    this.emit({ startSample: start, samples, speechFrames: speech });
  }

  /** Drop everything buffered without emitting. */
  discard() {
    this.open = [];
    this.preRoll = [];
    this.speechFrames = 0;
    this.silentFrames = 0;
    this.hang = 0;
  }
}
