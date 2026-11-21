import {
  type MeetRealtimeTrackKind,
  type MeetStreamCap,
  type MeetStreamEntitlement,
  resolveMeetStreamEntitlement,
} from '@tuturuuu/realtime/meet';

/** The ceiling for a publication kind; audio has none. */
export function streamCapFor(
  limits: MeetStreamEntitlement | undefined,
  kind: MeetRealtimeTrackKind
): MeetStreamCap | undefined {
  const entitlement = resolveMeetStreamEntitlement(limits);
  if (kind === 'video') return entitlement.camera;
  if (kind === 'screen') return entitlement.screen;
  return undefined;
}

/**
 * Clamp sender encodings to a signed stream ceiling. Each layer keeps its
 * own downscale unless the capture would still exceed the height cap; total
 * bitrate is scaled down proportionally; frame rate is capped. Adaptive
 * limits already applied are never raised.
 */
export function clampToStreamCap(
  encodings: RTCRtpEncodingParameters[],
  cap: MeetStreamCap | undefined,
  captureHeight: number | null | undefined
): RTCRtpEncodingParameters[] {
  if (!cap || !encodings.length) return encodings;
  const capBps = cap.maxBitrateKbps * 1000;
  // Unset layers get an even share before the total is scaled, so mixed
  // inputs can never exceed the aggregate cap.
  const budgeted = encodings.map(
    (encoding) => encoding.maxBitrate ?? Math.floor(capBps / encodings.length)
  );
  const total = budgeted.reduce((sum, bitrate) => sum + bitrate, 0);
  const factor = total > capBps ? capBps / total : 1;
  const minimumScale =
    captureHeight && captureHeight > cap.maxHeight
      ? captureHeight / cap.maxHeight
      : 1;
  // Each layer reaches the height cap, but layers that would collapse onto
  // the same size keep their original spacing.
  let previous: { original: number; scaled: number } | null = null;
  const scales = encodings.map((encoding) => {
    const original = encoding.scaleResolutionDownBy ?? 1;
    let scaled = Math.max(original, minimumScale);
    if (previous && original > previous.original && scaled <= previous.scaled)
      scaled = previous.scaled * (original / previous.original);
    previous = { original, scaled };
    return scaled;
  });
  return encodings.map((encoding, index) => ({
    ...encoding,
    maxBitrate: Math.max(1, Math.floor(budgeted[index]! * factor)),
    maxFramerate: Math.min(
      encoding.maxFramerate ?? cap.maxFrameRate,
      cap.maxFrameRate
    ),
    scaleResolutionDownBy: scales[index]!,
  }));
}

/** The height a capture track currently delivers, when the browser says. */
export function captureHeight(track: MediaStreamTrack | null | undefined) {
  const height = track?.getSettings?.().height;
  return typeof height === 'number' && height > 0 ? height : null;
}
