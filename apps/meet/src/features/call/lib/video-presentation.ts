/** Observe rendered video independently of delayed receiver mute/packet flags. */
export function observeVideoPresentation(
  video: HTMLVideoElement,
  stream: MediaStream,
  onChange: (presenting: boolean) => void,
  expireIdleFrames = true
) {
  let active = true;
  let presenting = false;
  let lastFrame = Number.NEGATIVE_INFINITY;
  let frameId: number | undefined;
  const tracks = stream.getVideoTracks();
  const current = () =>
    active &&
    video.srcObject === stream &&
    tracks.some((track) => track.readyState === 'live' && track.enabled);
  const update = (value: boolean) => {
    if (!active || presenting === value) return;
    presenting = value;
    onChange(value);
  };
  const frame = () => {
    if (!active) return;
    if (current()) {
      lastFrame = performance.now();
      update(true);
    }
    frameId = video.requestVideoFrameCallback(frame);
  };
  const fallback = () => {
    if (
      current() &&
      !video.paused &&
      video.readyState >= 2 &&
      video.videoWidth > 0
    ) {
      lastFrame = performance.now();
      update(true);
    }
  };
  const reset = () => {
    lastFrame = Number.NEGATIVE_INFINITY;
    update(false);
  };
  const supportsFrames = typeof video.requestVideoFrameCallback === 'function';
  video.addEventListener('playing', fallback);
  if (supportsFrames) frameId = video.requestVideoFrameCallback(frame);
  else {
    video.addEventListener('timeupdate', fallback);
    fallback();
  }
  for (const event of ['emptied', 'ended', 'error'])
    video.addEventListener(event, reset);
  for (const track of tracks) track.addEventListener('ended', reset);
  const timer = setInterval(() => {
    if (
      !current() ||
      (expireIdleFrames && performance.now() - lastFrame > 3000)
    )
      update(false);
  }, 1000);
  return () => {
    active = false;
    clearInterval(timer);
    if (frameId !== undefined) video.cancelVideoFrameCallback(frameId);
    video.removeEventListener('playing', fallback);
    video.removeEventListener('timeupdate', fallback);
    for (const event of ['emptied', 'ended', 'error'])
      video.removeEventListener(event, reset);
    for (const track of tracks) track.removeEventListener('ended', reset);
  };
}
