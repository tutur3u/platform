import type {
  MeetMediaQualitySample,
  MeetVideoLayer,
} from '@tuturuuu/realtime/meet';
import type { ReceiverSample } from './layer-policy';
import type { MediaPolicySnapshot } from './media-policy';

type SenderReading = {
  sendKbps: number | null;
  availableSendKbps: number | null;
  rttMs: number | null;
  loss: number | null;
  cpuLimited: boolean;
  sendLayers: number;
  cameraHeight?: number | null;
  cameraFps?: number | null;
  screenHeight?: number | null;
  screenFps?: number | null;
};

/**
 * A reading not refreshed within this window describes no live measurement.
 * The publisher samples every 3 s and the subscriber every 2 s.
 */
export const MEDIA_READING_TTL_MS = 6000;

/**
 * Collects the numbers the publisher and subscriber loops already measure,
 * so room diagnostics cost no extra `getStats()` call. Readings expire on
 * their own, so a loop that stops measuring for any reason never leaves a
 * stale value behind. The latest reading is also exposed as
 * `globalThis.__meetMediaStats` for load tests; it holds counters and rates
 * only.
 */
export function createMediaQualityRecorder(clock: () => number = Date.now) {
  let sender: SenderReading | null = null;
  let senderAt = -Infinity;
  let receiver: ReceiverSample | null = null;
  let receiverAt = -Infinity;
  let layers: Record<MeetVideoLayer, number> = { high: 0, mid: 0, low: 0 };
  let freezes = 0;
  let freezeMeasuredMs = 0;
  let smallMode = false;
  let since = clock();
  const none = () => ({ high: 0, mid: 0, low: 0 });
  const current = () => {
    const now = clock();
    const liveReceiver = now - receiverAt <= MEDIA_READING_TTL_MS;
    return {
      sender: now - senderAt <= MEDIA_READING_TTL_MS ? sender : null,
      receiver: liveReceiver ? receiver : null,
      layers: liveReceiver ? layers : none(),
    };
  };
  // A getter, so load tests read the same expiry as room reports.
  const publish = () =>
    Object.defineProperty(globalThis, '__meetMediaStats', {
      configurable: true,
      enumerable: false,
      get: () => ({ ...current(), freezesSinceReport: freezes }),
    });
  return {
    /** A null reading clears the sender, for example when its peer retires. */
    recordSender(reading: SenderReading | null) {
      sender = reading;
      senderAt = clock();
      publish();
    },
    recordReceiver(
      sample: ReceiverSample | null,
      requested: Iterable<MeetVideoLayer>,
      thumbnails: boolean
    ) {
      smallMode = thumbnails;
      // No sample means no camera is being measured: report none, not the
      // last reading.
      receiver = sample;
      receiverAt = clock();
      // Freezes and the time they cover accrue only from samples whose
      // browser reported freeze counters, so the rate uses measured time.
      if (sample?.freezesMeasured) {
        freezes += sample.freezes;
        freezeMeasuredMs += sample.measuredMs ?? 0;
      }
      layers = none();
      for (const layer of requested) layers[layer]++;
      publish();
    },
    /** The sample for one report interval; freezes restart from zero. */
    take(policy: MediaPolicySnapshot) {
      const now = clock();
      const { sender, receiver, layers } = current();
      const sample: MeetMediaQualitySample = {
        sendKbps: round(sender?.sendKbps),
        availableSendKbps: round(sender?.availableSendKbps),
        recvVideoKbps: round(receiver?.receivedKbps),
        rttMs: round(receiver?.rttMs ?? sender?.rttMs),
        recvLoss: fraction(receiver?.loss),
        sendLoss: fraction(sender?.loss),
        freezes: Math.min(10_000, freezes),
        layers,
        sendLayers: Math.min(3, sender?.sendLayers ?? 0),
        cpuLimited: sender?.cpuLimited ?? false,
        // Receivers never pause video for the link; the field stays for the
        // room report contract.
        audioOnly: false,
        smallMode,
        visibility: policy.visibility,
        intervalMs: Math.min(600_000, Math.max(1000, now - since)),
        freezesMeasured: freezeMeasuredMs > 0,
        freezeMeasuredMs: Math.min(600_000, Math.round(freezeMeasuredMs)),
        cameraHeight: round(sender?.cameraHeight),
        cameraFps: round(sender?.cameraFps),
        screenHeight: round(sender?.screenHeight),
        screenFps: round(sender?.screenFps),
      };
      freezes = 0;
      freezeMeasuredMs = 0;
      since = now;
      return sample;
    },
  };
}
export type MediaQualityRecorder = ReturnType<
  typeof createMediaQualityRecorder
>;

const round = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value)
    ? null
    : Math.min(1_000_000, Math.max(0, Math.round(value)));
const fraction = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value)
    ? null
    : Math.min(1, Math.max(0, Math.round(value * 10_000) / 10_000));
