import {
  MEET_AUDIO_CLIP_MAX_BYTES,
  MEET_PCM_SAMPLE_BYTES,
  MEET_WAV_HEADER_BYTES,
} from '@tuturuuu/ai/meetings/audio-contract';
import { meetBrowserPath } from '@tuturuuu/utils/meet-url';

const SAMPLE_RATE = 16_000;
const MAX_CLIP_SAMPLES = Math.floor(
  (MEET_AUDIO_CLIP_MAX_BYTES - MEET_WAV_HEADER_BYTES) / MEET_PCM_SAMPLE_BYTES
);

export function hasMeetSpeech(samples: Float32Array, threshold = 0.000001) {
  if (!Number.isFinite(threshold) || threshold < 0)
    throw new RangeError('Invalid Meet voice energy threshold');
  // Evaluate 20 ms frames so short utterances are not diluted by a 10 s window.
  for (let offset = 0; offset < samples.length; offset += 320) {
    const end = Math.min(samples.length, offset + 320);
    let energy = 0;
    for (let i = offset; i < end; i++) energy += samples[i]! ** 2;
    if (energy / (end - offset) > threshold) return true;
  }
  return false;
}

export function encodeMeetWav(samples: Float32Array): Blob {
  const pcmBytes = samples.length * MEET_PCM_SAMPLE_BYTES;
  const data = new ArrayBuffer(MEET_WAV_HEADER_BYTES + pcmBytes);
  const view = new DataView(data);
  const write = (offset: number, value: string) =>
    [...value].forEach((char, index) => {
      view.setUint8(offset + index, char.charCodeAt(0));
    });
  write(0, 'RIFF');
  view.setUint32(4, data.byteLength - 8, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * MEET_PCM_SAMPLE_BYTES, true);
  view.setUint16(32, MEET_PCM_SAMPLE_BYTES, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, pcmBytes, true);
  samples.forEach((sample, index) => {
    view.setInt16(
      MEET_WAV_HEADER_BYTES + index * MEET_PCM_SAMPLE_BYTES,
      Math.max(-1, Math.min(1, sample)) * 32767,
      true
    );
  });
  return new Blob([data], { type: 'audio/wav' });
}

export type MeetAudioSource = {
  stream: MediaStream;
  accountId?: string;
  kind: 'microphone' | 'shared_audio';
};
type CaptureSource = {
  identity: string;
  source: MediaStreamAudioSourceNode;
  node: AudioWorkletNode;
  cleanup: () => void;
  flush: () => Promise<boolean>;
};

/** Keep microphone sources separate; never acquire another microphone or replay audio. */
export class MeetAudioCapture {
  private context: AudioContext | null = null;
  private silent: GainNode | null = null;
  private sources = new Map<string, CaptureSource>();
  private draining = new Set<Promise<boolean>>();
  private stopping = false;
  private incomplete = false;
  private nodes = new Set<AudioWorkletNode>();
  private origin = 0;
  constructor(
    private onChunk: (
      audio: Blob,
      startSeconds: number,
      source?: Omit<MeetAudioSource, 'stream'>
    ) => void,
    private readonly energyThreshold = 0.000001
  ) {}
  async start() {
    this.stopping = false;
    this.incomplete = false;
    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    this.context = context;
    if (context.sampleRate !== SAMPLE_RATE)
      throw new Error('Unsupported audio sample rate');
    await context.audioWorklet.addModule(
      meetBrowserPath('/meet-audio-processor.js')
    );
    this.silent = context.createGain();
    this.silent.gain.value = 0;
    this.silent.connect(context.destination);
    await context.resume();
    this.origin = context.currentTime;
  }
  update(inputs: MeetAudioSource[]) {
    const context = this.context;
    if (!context || !this.silent || this.stopping) return;
    const tracks = inputs.flatMap((input) =>
      input.stream
        .getAudioTracks()
        .filter((track) => track.readyState === 'live')
        .map((track) => ({ track, input }))
    );
    const ids = new Set(tracks.map(({ track }) => track.id));
    for (const id of this.sources.keys())
      if (!ids.has(id)) this.removeSource(id);
    for (const { track, input } of tracks) {
      const identity = JSON.stringify([input.accountId, input.kind]);
      if (this.sources.get(track.id)?.identity === identity) continue;
      this.removeSource(track.id);
      const source = context.createMediaStreamSource(new MediaStream([track]));
      const node = new AudioWorkletNode(context, 'meet-audio', {
        channelCount: 1,
        channelCountMode: 'explicit',
      });
      this.nodes.add(node);
      let elapsed = Math.max(0, context.currentTime - this.origin);
      let acknowledge: (() => void) | undefined;
      node.port.onmessage = ({
        data,
      }: MessageEvent<{ samples?: Float32Array; flushed?: boolean }>) => {
        const inputSamples = data.samples;
        for (
          let offset = 0;
          inputSamples && offset < inputSamples.length;
          offset += MAX_CLIP_SAMPLES
        ) {
          const samples = inputSamples.subarray(
            offset,
            offset + MAX_CLIP_SAMPLES
          );
          const start = elapsed;
          elapsed += samples.length / SAMPLE_RATE;
          if (hasMeetSpeech(samples, this.energyThreshold))
            this.onChunk(encodeMeetWav(samples), start, {
              accountId: input.accountId,
              kind: input.kind,
            });
        }
        if (data.flushed) acknowledge?.();
      };
      source.connect(node);
      node.connect(this.silent);
      const ended = () => this.removeSource(track.id);
      track.addEventListener('ended', ended, { once: true });
      this.sources.set(track.id, {
        identity,
        source,
        node,
        cleanup: () => track.removeEventListener('ended', ended),
        flush: () =>
          new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => resolve(false), 1000);
            acknowledge = () => {
              clearTimeout(timer);
              resolve(true);
            };
            node.port.postMessage('flush');
          }),
      });
    }
  }
  private removeSource(id: string) {
    const entry = this.sources.get(id);
    if (!entry) return;
    this.sources.delete(id);
    entry.source.disconnect();
    entry.cleanup();
    const drain = entry
      .flush()
      .then((ok) => {
        if (!ok) this.incomplete = true;
        return ok;
      })
      .finally(() => {
        entry.node.port.onmessage = null;
        entry.node.disconnect();
        this.nodes.delete(entry.node);
        this.draining.delete(drain);
      });
    this.draining.add(drain);
  }
  async stop() {
    this.stopping = true;
    for (const id of this.sources.keys()) this.removeSource(id);
    const results = await Promise.all(this.draining);
    this.dispose();
    return !this.incomplete && results.every(Boolean);
  }
  dispose() {
    this.stopping = true;
    for (const entry of this.sources.values()) {
      entry.cleanup();
      entry.source.disconnect();
      entry.node.disconnect();
      entry.node.port.onmessage = null;
    }
    this.sources.clear();
    for (const node of this.nodes) {
      node.port.onmessage = null;
      node.disconnect();
    }
    this.nodes.clear();
    this.silent?.disconnect();
    this.silent = null;
    if (this.context && this.context.state !== 'closed')
      void this.context.close();
    this.context = null;
  }
}
