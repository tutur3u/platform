/** PCM playback is local. This stream is never attached to the meeting publisher. */
export class LiveAudioPlayer {
  private context?: AudioContext;
  private nextTime = 0;
  private closed = false;
  private sources = new Set<AudioBufferSourceNode>();
  private pending: Array<{ data: string; sampleRate: number; at: number }> = [];
  private pendingBytes = 0;
  async unlock(outputDeviceId?: string) {
    this.closed = false;
    this.context ??= new AudioContext({ sampleRate: 24000 });
    if ('setSinkId' in this.context)
      await (
        this.context as AudioContext & {
          setSinkId: (id: string) => Promise<void>;
        }
      ).setSinkId(outputDeviceId || '');
    await this.context.resume();
    const pending = this.pending;
    this.pending = [];
    this.pendingBytes = 0;
    for (const item of pending)
      if (Date.now() - item.at < 3000) this.play(item.data, item.sampleRate);
  }
  play(data: string, sampleRate = 24000) {
    if (this.closed) return;
    const context = this.context;
    if (context?.state !== 'running') {
      if (data.length > 128000) return;
      this.pending.push({ data, sampleRate, at: Date.now() });
      this.pendingBytes += data.length;
      while (this.pendingBytes > 192000 && this.pending.length)
        this.pendingBytes -= this.pending.shift()!.data.length;
      return;
    }
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(data), (value) => value.charCodeAt(0));
    } catch {
      return;
    }
    if (!bytes.length || bytes.length % 2 || bytes.length > 96000) return;
    const pcm = new DataView(bytes.buffer);
    const buffer = context.createBuffer(1, bytes.length / 2, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++)
      channel[i] = pcm.getInt16(i * 2, true) / 32768;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    // Never accumulate delayed speech after a suspended tab or output interruption.
    if (this.nextTime > context.currentTime + 3) this.interrupt();
    this.nextTime = Math.max(context.currentTime + 0.025, this.nextTime);
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
    source.start(this.nextTime);
    this.nextTime += buffer.duration;
  }
  interrupt() {
    this.pending = [];
    this.pendingBytes = 0;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {}
    }
    this.sources.clear();
    this.nextTime = 0;
  }
  close() {
    this.closed = true;
    this.interrupt();
    void this.context?.close();
    this.context = undefined;
  }
}
export async function captureLiveAudio(
  streams: MediaStream[],
  onAudio: (data: string) => void,
  onInputEnded?: () => void
) {
  const context = new AudioContext({ sampleRate: 16000 });
  try {
    if (context.sampleRate !== 16000)
      throw new Error('Unsupported input sample rate');
    await context.audioWorklet.addModule('/meet-live-processor.js');
    const processor = new AudioWorkletNode(context, 'meet-live-pcm');
    const mute = context.createGain();
    mute.gain.value = 0;
    const sources = new Map<MediaStreamTrack, MediaStreamAudioSourceNode>();
    const ended = () => {
      update(
        [...sources.keys()]
          .filter((track) => track.readyState === 'live')
          .map((track) => new MediaStream([track]))
      );
      if (!sources.size) onInputEnded?.();
    };
    const update = (next: MediaStream[]) => {
      const tracks = new Set(next.flatMap((stream) => stream.getAudioTracks()));
      for (const [track, source] of sources) {
        if (!tracks.has(track) || track.readyState === 'ended') {
          source.disconnect();
          track.removeEventListener('ended', ended);
          sources.delete(track);
        }
      }
      for (const track of tracks) {
        if (sources.has(track) || track.readyState === 'ended') continue;
        const source = context.createMediaStreamSource(
          new MediaStream([track])
        );
        source.connect(processor);
        sources.set(track, source);
        track.addEventListener('ended', ended);
      }
    };
    update(streams);
    processor.connect(mute).connect(context.destination);
    let acknowledge: (() => void) | undefined;
    processor.port.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
      if (event.data === 'flushed') {
        acknowledge?.();
        return;
      }
      if (typeof event.data === 'string') return;
      const bytes = new Uint8Array(event.data);
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      onAudio(btoa(binary));
    };
    await context.resume();
    let disposed: Promise<void> | undefined;
    const dispose = () =>
      (disposed ??= (async () => {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 250);
          acknowledge = () => {
            clearTimeout(timeout);
            resolve();
          };
          processor.port.postMessage('flush');
        });
        processor.port.onmessage = null;
        for (const [track, source] of sources) {
          track.removeEventListener('ended', ended);
          source.disconnect();
        }
        processor.disconnect();
        await context.close();
      })());
    return { dispose, update };
  } catch (error) {
    await context.close();
    throw error;
  }
}
