export type CameraFilter = 'none' | 'warm' | 'cool' | 'mono';
export type CameraLook = { filter: CameraFilter; softness: number };
export const DEFAULT_CAMERA_LOOK: CameraLook = { filter: 'none', softness: 0 };
const FILTERS: Record<CameraFilter, string> = {
  none: '',
  warm: 'sepia(0.15) saturate(1.12)',
  cool: 'saturate(0.88) hue-rotate(8deg)',
  mono: 'grayscale(1)',
};
export function cameraFilterCss(look: CameraLook) {
  const soft = Math.min(1, Math.max(0, look.softness));
  return (
    [
      FILTERS[look.filter],
      soft
        ? `blur(${(soft * 0.6).toFixed(2)}px) brightness(${1 + soft * 0.05}) contrast(${1 - soft * 0.04})`
        : '',
    ]
      .filter(Boolean)
      .join(' ') || 'none'
  );
}

/** Local canvas processing: effects are applied to the transmitted track too. */
export class CameraEffects {
  private source: MediaStreamTrack | null = null;
  private output: MediaStreamTrack | null = null;
  private video: HTMLVideoElement | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private generation = 0;
  private look = DEFAULT_CAMERA_LOOK;

  setEnabled(enabled: boolean) {
    if (this.source) this.source.enabled = enabled;
    if (this.output) this.output.enabled = enabled;
  }
  private stopOutput() {
    clearInterval(this.timer);
    this.output?.stop();
    this.output = null;
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video = null;
    }
  }
  dispose() {
    this.generation++;
    this.stopOutput();
    this.source?.stop();
    this.source = null;
  }
  async setSource(source: MediaStreamTrack) {
    this.dispose();
    this.source = source;
    return this.setLook(this.look);
  }
  async setLook(look: CameraLook): Promise<MediaStreamTrack | null> {
    this.look = look;
    const source = this.source;
    if (!source || source.readyState === 'ended') return null;
    const generation = ++this.generation;
    if (cameraFilterCss(look) === 'none') {
      this.stopOutput();
      return source;
    }
    if (this.output?.readyState === 'live') return this.output;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([source]);
    try {
      await video.play();
    } catch (error) {
      video.srcObject = null;
      throw error;
    }
    if (generation !== this.generation || this.source !== source) {
      video.pause();
      video.srcObject = null;
      throw new DOMException('Camera changed', 'AbortError');
    }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1280 / (video.videoWidth || 1280));
    canvas.width = Math.round((video.videoWidth || 1280) * scale);
    canvas.height = Math.round((video.videoHeight || 720) * scale);
    const context = canvas.getContext('2d');
    if (!context || !('filter' in context) || !canvas.captureStream) {
      video.pause();
      video.srcObject = null;
      throw new Error('camera_effects_unavailable');
    }
    const draw = () => {
      context.filter = cameraFilterCss(this.look);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
    };
    draw();
    this.output = canvas.captureStream(24).getVideoTracks()[0] ?? null;
    if (this.output) this.output.enabled = source.enabled;
    this.video = video;
    this.timer = setInterval(draw, 1000 / 24);
    return this.output ?? source;
  }
}
