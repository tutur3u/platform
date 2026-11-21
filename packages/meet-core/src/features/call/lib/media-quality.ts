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
};

/**
 * Collects the numbers the publisher and subscriber loops already measure,
 * so room diagnostics cost no extra `getStats()` call. The latest reading is
 * also exposed as `globalThis.__meetMediaStats` for load tests; it holds
 * counters and rates only.
 */
export function createMediaQualityRecorder(clock: () => number = Date.now) {
  let sender: SenderReading | null = null;
  let receiver: ReceiverSample | null = null;
  let layers: Record<MeetVideoLayer, number> = { high: 0, mid: 0, low: 0 };
  let freezes = 0;
  let smallMode = false;
  let since = clock();
  const publish = () => {
    (globalThis as { __meetMediaStats?: unknown }).__meetMediaStats = {
      sender,
      receiver,
      layers,
      freezesSinceReport: freezes,
    };
  };
  return {
    recordSender(reading: SenderReading) {
      sender = reading;
      publish();
    },
    recordReceiver(
      sample: ReceiverSample | null,
      requested: Iterable<MeetVideoLayer>,
      thumbnails: boolean
    ) {
      smallMode = thumbnails;
      if (sample) {
        receiver = sample;
        freezes += sample.freezes;
      }
      layers = { high: 0, mid: 0, low: 0 };
      for (const layer of requested) layers[layer]++;
      publish();
    },
    /** The sample for one report interval; freezes restart from zero. */
    take(policy: MediaPolicySnapshot) {
      const now = clock();
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
        audioOnly: policy.audioOnly,
        smallMode,
        visibility: policy.visibility,
        intervalMs: Math.min(600_000, Math.max(1000, now - since)),
      };
      freezes = 0;
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
