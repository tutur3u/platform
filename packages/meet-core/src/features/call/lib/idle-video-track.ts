/**
 * A black, low-rate canvas track that keeps the camera's SFU publication alive
 * while the camera device itself is released. Cloudflare expires a track that
 * stops sending packets, and `replaceTrack(null)` would do exactly that. A
 * canvas track is not a capture device, so it never lights the camera
 * indicator.
 */
const IDLE_WIDTH = 320;
const IDLE_HEIGHT = 180;
const IDLE_FRAME_MS = 500;

let idle: {
  track: MediaStreamTrack;
  timer: ReturnType<typeof setInterval>;
} | null = null;

export function acquireIdleVideoTrack(): MediaStreamTrack | null {
  if (idle?.track.readyState === 'live') return idle.track;
  releaseIdleVideoTrack();
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = IDLE_WIDTH;
  canvas.height = IDLE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context || typeof canvas.captureStream !== 'function') return null;
  // Each repaint is a new frame, so a static picture still produces traffic.
  const paint = () => {
    context.fillStyle = '#000';
    context.fillRect(0, 0, IDLE_WIDTH, IDLE_HEIGHT);
  };
  paint();
  const track = canvas.captureStream(1000 / IDLE_FRAME_MS).getVideoTracks()[0];
  if (!track) return null;
  idle = { track, timer: setInterval(paint, IDLE_FRAME_MS) };
  return track;
}

export function releaseIdleVideoTrack() {
  if (!idle) return;
  clearInterval(idle.timer);
  idle.track.stop();
  idle = null;
}
