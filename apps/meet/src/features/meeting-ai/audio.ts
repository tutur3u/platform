export function encodeMeetWav(samples: Float32Array): Blob {
  const data = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(data);
  const write = (offset: number, value: string) =>
    [...value].forEach((char, index) => {
      view.setUint8(offset + index, char.charCodeAt(0));
    });
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => {
    view.setInt16(
      44 + index * 2,
      Math.max(-1, Math.min(1, sample)) * 32767,
      true
    );
  });
  return new Blob([data], { type: 'audio/wav' });
}

/** Captures the host's local and received audio without opening another mic. */
export class MeetAudioCapture {
  private context!: AudioContext;
  private node: AudioWorkletNode | null = null;
  private sources = new Map<string, MediaStreamAudioSourceNode>();
  private elapsed = 0;
  private mixer: GainNode | null = null;
  constructor(private onChunk: (audio: Blob, startSeconds: number) => void) {}
  async start() {
    this.elapsed = 0;
    this.context = new AudioContext({ sampleRate: 16000 });
    if (this.context.sampleRate !== 16000)
      throw new Error('Unsupported audio sample rate');
    await this.context.audioWorklet.addModule('/meet-audio-processor.js');
    this.node = new AudioWorkletNode(this.context, 'meet-audio', {
      channelCount: 1,
      channelCountMode: 'explicit',
    });
    this.mixer = this.context.createGain();
    this.mixer.connect(this.node);
    // A silent output keeps the graph processing without replaying call audio.
    const silent = this.context.createGain();
    silent.gain.value = 0;
    this.node.connect(silent).connect(this.context.destination);
    this.node.port.onmessage = ({
      data,
    }: MessageEvent<{ samples?: Float32Array }>) => {
      if (!data.samples) return;
      const start = this.elapsed;
      this.elapsed += data.samples.length / 16000;
      const energy =
        data.samples.reduce((sum, value) => sum + value * value, 0) /
        data.samples.length;
      if (energy > 0.000001) this.onChunk(encodeMeetWav(data.samples), start);
    };
    await this.context.resume();
  }
  update(streams: MediaStream[]) {
    if (!this.node) return;
    const tracks = streams
      .flatMap((stream) => stream.getAudioTracks())
      .filter((track) => track.readyState === 'live');
    const ids = new Set(tracks.map((track) => track.id));
    for (const [id, source] of this.sources)
      if (!ids.has(id)) {
        source.disconnect();
        this.sources.delete(id);
      }
    for (const track of tracks)
      if (!this.sources.has(track.id)) {
        const source = this.context.createMediaStreamSource(
          new MediaStream([track])
        );
        source.connect(this.mixer!);
        this.sources.set(track.id, source);
      }
    if (this.mixer) this.mixer.gain.value = 1 / Math.max(1, this.sources.size);
  }
  async stop() {
    let flushed = true;
    if (this.node) {
      const node = this.node;
      flushed = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 1000);
        node.port.addEventListener(
          'message',
          ({ data }) => {
            if (data.flushed) {
              clearTimeout(timeout);
              resolve(true);
            }
          },
          { once: false }
        );
        node.port.postMessage('flush');
      });
    }
    this.dispose();
    return flushed;
  }
  dispose() {
    for (const source of this.sources.values()) source.disconnect();
    this.sources.clear();
    this.mixer?.disconnect();
    this.mixer = null;
    this.node?.disconnect();
    this.node = null;
    if (this.context && this.context.state !== 'closed')
      void this.context.close();
  }
}
