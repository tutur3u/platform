/** PCM playback is local. This stream is never attached to the meeting publisher. */
export class LiveAudioPlayer {
  private context?: AudioContext;
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  async unlock(outputDeviceId?: string) {
    this.context ??= new AudioContext({ sampleRate: 24000 });
    if ('setSinkId' in this.context)
      await (
        this.context as AudioContext & {
          setSinkId: (id: string) => Promise<void>;
        }
      ).setSinkId(outputDeviceId || '');
    await this.context.resume();
  }
  play(data: string, sampleRate = 24000) {
    const context = this.context;
    if (context?.state !== 'running') return;
    const bytes = Uint8Array.from(atob(data), (value) => value.charCodeAt(0));
    if (bytes.length % 2 || bytes.length > 96000) return;
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
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {}
    }
    this.sources.clear();
    this.nextTime = 0;
  }
  close() {
    this.interrupt();
    void this.context?.close();
    this.context = undefined;
  }
}
export async function captureLiveAudio(
  streams: MediaStream[],
  onAudio: (data: string) => void
) {
  const context = new AudioContext();
  try {
    await context.audioWorklet.addModule('/meet-live-processor.js');
    const processor = new AudioWorkletNode(context, 'meet-live-pcm');
    const mute = context.createGain();
    mute.gain.value = 0;
    const sources = new Map<MediaStreamTrack, MediaStreamAudioSourceNode>();
    const update = (next: MediaStream[]) => {
      const tracks = new Set(next.flatMap((stream) => stream.getAudioTracks()));
      for (const [track, source] of sources) {
        if (!tracks.has(track) || track.readyState === 'ended') {
          source.disconnect();
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
      }
    };
    update(streams);
    processor.connect(mute).connect(context.destination);
    processor.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      const bytes = new Uint8Array(event.data);
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      onAudio(btoa(binary));
    };
    await context.resume();
    const dispose = () => {
      processor.port.onmessage = null;
      for (const source of sources.values()) source.disconnect();
      processor.disconnect();
      void context.close();
    };
    return { dispose, update };
  } catch (error) {
    await context.close();
    throw error;
  }
}
