import { useSyncExternalStore } from 'react';

const NOISE_FLOOR = 0.004;
const RMS_GAIN = 5;
const EMPTY_DEVICES: readonly MediaDeviceInfo[] = [];
/**
 * Browser alias entries that duplicate a real device: `default` everywhere and
 * Chrome-on-Windows' `communications` endpoint. The pickers expose a separate
 * "System default" choice instead.
 */
const PSEUDO_DEVICE_IDS = new Set(['default', 'communications']);

export type MediaDevicesLike = Pick<MediaDevices, 'enumerateDevices'> &
  Partial<Pick<MediaDevices, 'addEventListener' | 'removeEventListener'>>;

export interface MediaDeviceStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => readonly MediaDeviceInfo[];
  getServerSnapshot: () => readonly MediaDeviceInfo[];
  refresh: () => Promise<void>;
}

/** Map [-1, 1] time-domain PCM samples to a normalized [0, 1] meter level. */
export function computeRmsLevel(samples: ArrayLike<number>): number {
  const count = samples.length;
  if (!count) return 0;
  let sumSquares = 0;
  for (let index = 0; index < count; index++) {
    const sample = samples[index] ?? 0;
    sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / count);
  if (!Number.isFinite(rms) || rms <= NOISE_FLOOR) return 0;
  return Math.min(1, (rms - NOISE_FLOOR) * RMS_GAIN);
}

/** Stop every track on a local preview stream without throwing on partial mocks. */
export function stopMediaStream(stream: MediaStream | null | undefined) {
  for (const track of stream?.getTracks?.() ?? []) track.stop();
}

export function isAudioOutputSelectionSupported(): boolean {
  return (
    typeof HTMLMediaElement !== 'undefined' &&
    'setSinkId' in HTMLMediaElement.prototype
  );
}

export function filterDevicesByKind(
  devices: readonly MediaDeviceInfo[],
  kind: MediaDeviceKind
): MediaDeviceInfo[] {
  const seen = new Set<string>();
  const filtered: MediaDeviceInfo[] = [];
  for (const device of devices) {
    if (
      device.kind !== kind ||
      !device.deviceId ||
      PSEUDO_DEVICE_IDS.has(device.deviceId) ||
      seen.has(device.deviceId)
    )
      continue;
    seen.add(device.deviceId);
    filtered.push(device);
  }
  return filtered;
}

/**
 * Sample a local microphone track through an unconnected AnalyserNode so the
 * lobby can show live voice activity without playing back or publishing audio.
 */
export function startMicrophoneMeter(
  stream: MediaStream,
  onLevel: (level: number) => void,
  intervalMs = 60
): () => void {
  const track = stream
    .getAudioTracks?.()
    .find((entry) => entry.readyState === 'live');
  const AudioContextCtor =
    typeof AudioContext !== 'undefined' ? AudioContext : undefined;
  if (!track || !AudioContextCtor) {
    onLevel(0);
    return () => {};
  }

  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const resume = () => {
    if (context?.state === 'suspended')
      void context.resume().catch(() => undefined);
  };

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', resume);
      document.removeEventListener('keydown', resume);
    }
    try {
      source?.disconnect();
      analyser?.disconnect();
    } catch {
      // Ignore already-disconnected Web Audio nodes during teardown.
    }
    onLevel(0);
    if (context) void context.close().catch(() => undefined);
    context = null;
  };

  try {
    context = new AudioContextCtor();
    resume();
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', resume);
      document.addEventListener('keydown', resume);
    }
    analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;
    source = context.createMediaStreamSource(new MediaStream([track]));
    source.connect(analyser);
    const waveform = new Float32Array(analyser.fftSize);
    const bytes = new Uint8Array(analyser.fftSize);

    const sample = () => {
      if (
        stopped ||
        !analyser ||
        !track.enabled ||
        track.muted ||
        track.readyState !== 'live'
      ) {
        onLevel(0);
        return;
      }
      if (context?.state && context.state !== 'running') {
        onLevel(0);
        return;
      }
      if (typeof analyser.getFloatTimeDomainData === 'function') {
        analyser.getFloatTimeDomainData(waveform);
      } else {
        analyser.getByteTimeDomainData(bytes);
        for (let i = 0; i < bytes.length; i++)
          waveform[i] = ((bytes[i] ?? 128) - 128) / 128;
      }
      onLevel(computeRmsLevel(waveform));
    };

    timer = setInterval(sample, intervalMs);
    sample();
    return cleanup;
  } catch {
    cleanup();
    return () => {};
  }
}

function sameDeviceList(
  previous: readonly MediaDeviceInfo[],
  next: readonly MediaDeviceInfo[]
) {
  if (previous.length !== next.length) return false;
  for (let index = 0; index < previous.length; index++) {
    const a = previous[index];
    const b = next[index];
    if (
      !a ||
      !b ||
      a.kind !== b.kind ||
      a.deviceId !== b.deviceId ||
      a.label !== b.label
    )
      return false;
  }
  return true;
}

export function createMediaDeviceStore(
  mediaDevices?: MediaDevicesLike | null
): MediaDeviceStore {
  let snapshot: readonly MediaDeviceInfo[] = EMPTY_DEVICES;
  const listeners = new Set<() => void>();

  const refresh = async () => {
    if (typeof mediaDevices?.enumerateDevices !== 'function') return;
    try {
      const listed = await mediaDevices.enumerateDevices();
      const next = Array.isArray(listed) ? listed : EMPTY_DEVICES;
      if (sameDeviceList(snapshot, next)) return;
      snapshot = next;
      for (const listener of listeners) listener();
    } catch {
      // Enumerating devices before permission or in restricted contexts fails closed.
    }
  };

  const onDeviceChange = () => {
    void refresh();
  };

  return {
    subscribe: (listener) => {
      const wasEmpty = listeners.size === 0;
      listeners.add(listener);
      if (wasEmpty) {
        mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
      }
      void refresh();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
        }
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => EMPTY_DEVICES,
    refresh,
  };
}

const inertStore = createMediaDeviceStore(null);
const deviceStores = new WeakMap<object, MediaDeviceStore>();

function resolveBrowserDeviceStore(): MediaDeviceStore {
  const mediaDevices =
    typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!mediaDevices || typeof mediaDevices !== 'object') return inertStore;
  let store = deviceStores.get(mediaDevices);
  if (!store) {
    store = createMediaDeviceStore(mediaDevices);
    deviceStores.set(mediaDevices, store);
  }
  return store;
}

export function useLobbyMediaDevices() {
  const store = resolveBrowserDeviceStore();
  const devices = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot
  );
  return { devices, refreshDevices: store.refresh };
}
