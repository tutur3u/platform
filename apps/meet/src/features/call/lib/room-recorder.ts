/** Mixes the media actually available to this recorder, without opening a second microphone. */
export class RoomRecorder {
  private context: AudioContext | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private sources = new Map<string, MediaStreamAudioSourceNode>();
  private videos = new Map<string, HTMLVideoElement>();
  private canvas: HTMLCanvasElement | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private output: MediaStream | null = null;
  private unlock: Promise<void> | null = null;
  prepare() {
    this.context ??= new AudioContext();
    this.unlock ??= this.context.resume();
    return this.unlock;
  }
  async start(streams: MediaStream[]) {
    await this.prepare();
    if (!this.context) throw new Error('Recording cancelled');
    this.destination = this.context.createMediaStreamDestination();
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.update(streams);
    const video =
      typeof this.canvas.captureStream === 'function'
        ? this.canvas.captureStream(15)
        : null;
    this.output = new MediaStream([
      ...this.destination.stream.getAudioTracks(),
      ...(video?.getVideoTracks() ?? []),
    ]);
    this.timer = setInterval(() => this.draw(), 1000 / 15);
    return this.output;
  }
  update(streams: MediaStream[]) {
    if (!this.context || !this.destination) return;
    const tracks = new Map(
      streams
        .flatMap((stream) => stream.getTracks())
        .filter((track) => track.readyState === 'live')
        .map((track) => [track.id, track])
    );
    for (const [id, source] of this.sources)
      if (!tracks.has(id)) {
        source.disconnect();
        this.sources.delete(id);
      }
    for (const [id, video] of this.videos)
      if (!tracks.has(id)) {
        video.pause();
        video.srcObject = null;
        this.videos.delete(id);
      }
    for (const track of tracks.values()) {
      if (track.kind === 'audio' && !this.sources.has(track.id)) {
        const source = this.context.createMediaStreamSource(
          new MediaStream([track])
        );
        source.connect(this.destination);
        this.sources.set(track.id, source);
      }
      if (track.kind === 'video' && !this.videos.has(track.id)) {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = new MediaStream([track]);
        void video.play().catch(() => undefined);
        this.videos.set(track.id, video);
      }
    }
  }
  private draw() {
    const context = this.canvas?.getContext('2d');
    if (!context) return;
    context.fillStyle = '#111827';
    context.fillRect(0, 0, 1280, 720);
    const videos = [...this.videos.values()].filter(
      (v) => v.videoWidth && v.readyState >= 2
    );
    const cols = Math.ceil(Math.sqrt(Math.max(1, videos.length))),
      rows = Math.ceil(Math.max(1, videos.length) / cols),
      width = 1280 / cols,
      height = 720 / rows;
    videos.forEach((video, i) => {
      const ratio = Math.min(
        width / video.videoWidth,
        height / video.videoHeight
      );
      const w = video.videoWidth * ratio,
        h = video.videoHeight * ratio;
      context.drawImage(
        video,
        (i % cols) * width + (width - w) / 2,
        Math.floor(i / cols) * height + (height - h) / 2,
        w,
        h
      );
    });
  }
  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const source of this.sources.values()) source.disconnect();
    this.sources.clear();
    for (const video of this.videos.values()) {
      video.pause();
      video.srcObject = null;
    }
    this.videos.clear();
    this.output?.getTracks().forEach((track) => {
      track.stop();
    });
    this.output = null;
    if (this.context?.state !== 'closed') void this.context?.close();
    this.context = null;
    this.unlock = null;
    this.destination = null;
    this.canvas = null;
  }
}
