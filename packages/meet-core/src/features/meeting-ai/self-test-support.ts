import { vi } from 'vitest';
import type { SelfCaptureApi } from './self-api';
import type { SelfCaptureInputs } from './self-controller';
import type { SelfEngineFactory } from './self-engine';

export function fakeTrack(echoCancellation: boolean | null = true) {
  const settings: MediaTrackSettings = {
    echoCancellation: echoCancellation ?? undefined,
  };
  const track = {
    readyState: 'live',
    stop: vi.fn(),
    getSettings: () => settings,
    setEcho: (value: boolean) => {
      settings.echoCancellation = value;
    },
  };
  return track as typeof track & MediaStreamTrack;
}
export const streamOf = (...tracks: MediaStreamTrack[]) =>
  ({ getAudioTracks: () => tracks }) as unknown as MediaStream;

export function fakeEngine() {
  const engine = { swapTrack: vi.fn(), dispose: vi.fn() };
  const frames: { push: (frame: Float32Array) => void } = {
    push: () => undefined,
  };
  const factory = vi.fn<SelfEngineFactory>(async (_track, onFrame) => {
    frames.push = onFrame;
    return engine;
  });
  return { engine, factory, frames };
}

export function fakeApi(overrides: Partial<SelfCaptureApi> = {}) {
  return {
    open: vi.fn(async () => ({
      streamId: 'stream-1',
      consentRevision: 3,
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    })),
    renew: vi.fn(async () => ({
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    })),
    upload: vi.fn(async () => ({ status: 'processing' })),
    ...overrides,
  } satisfies SelfCaptureApi;
}

export const SELF_SESSION = {
  sessionId: 'session-1',
  protocol: 'self_v1',
} as const;
export function eligibleInputs(
  track: MediaStreamTrack,
  over: Partial<SelfCaptureInputs> = {}
): SelfCaptureInputs {
  return {
    mode: 'self',
    session: SELF_SESSION,
    allow: true,
    miraOn: true,
    connected: true,
    guest: false,
    stream: streamOf(track),
    joinEpoch: 1,
    ...over,
  };
}
