import {
  createRoomAudioGroup,
  type PlaybackTrack,
  type RoomAudioEvent,
  type RoomMember,
  shouldPlayRoomAudio,
  type SpeakerMode,
  stepRoomAudioGroup,
} from './group';
import { SAMPLE_RATE } from './mic-gate';

export const LAPTOPS = ['laptop-1', 'laptop-2', 'laptop-3'] as const;
export const TALKERS = ['A', 'B', 'C'] as const;
export const REMOTE = 'remote';
export const SAMPLE_COUNT = SAMPLE_RATE * 2;
const UNPLUG_SAMPLE = SAMPLE_RATE;
export const REMOTE_MIC: PlaybackTrack = {
  kind: 'microphone',
  publisherId: REMOTE,
  muted: false,
};

type Talker = (typeof TALKERS)[number];
type Stems = Record<Talker | typeof REMOTE, Float32Array>;
type Path = readonly [gain: number, delayMs: number];

export type RoomFixture = {
  id: string;
  label: string;
  speakerMode: SpeakerMode;
  microphones: ReadonlyMap<string, Stems>;
  noise: ReadonlyMap<string, Float32Array>;
  screenAudio: Float32Array | null;
  change?: { at: number; event: RoomAudioEvent };
};

export function makeMember(id: string): RoomMember {
  return {
    id,
    mic: 'enabled',
    speaker: 'enabled',
    devices: { microphone: true, speaker: true },
  };
}

export function fixtureGroup(speakerMode: SpeakerMode) {
  const callId = 'fixture-call';
  const code = 'TEST42';
  return LAPTOPS.reduce(
    (group, id) =>
      stepRoomAudioGroup(group, {
        kind: 'join',
        nowMs: 0,
        callId,
        code,
        member: makeMember(id),
      }),
    createRoomAudioGroup({ callId, code, expiresAtMs: 3_000, speakerMode })
  );
}

export function seededNoise(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
    return (state / 2 ** 32) * 2 - 1;
  };
}

function speech(seed: number, amplitude: number): Float32Array {
  const noise = seededNoise(seed);
  let previous = 0;
  let low = 0;
  const signal = new Float32Array(SAMPLE_COUNT);
  for (let sample = 0; sample < signal.length; sample++) {
    const white = noise();
    low += 0.15 * (white - low);
    const band = 0.8 * white + 0.2 * previous - low;
    previous = white;

    const ms = (sample * 1_000) / SAMPLE_RATE;
    const fade = Math.max(0, Math.min(1, (ms - 80) / 40, (1_920 - ms) / 40));
    const syllable =
      0.45 + 0.55 * Math.sin((ms / (135 + seed) + seed / 13) * Math.PI) ** 2;
    signal[sample] = amplitude * fade * syllable * band;
  }
  return signal;
}

function throughRoom(
  signal: Float32Array,
  [gain, delayMs]: Path
): Float32Array {
  const delay = (SAMPLE_RATE * delayMs) / 1_000;
  const captured = new Float32Array(SAMPLE_COUNT);
  for (let index = delay; index < SAMPLE_COUNT; index++) {
    captured[index] = gain * (signal[index - delay] ?? 0);
  }
  return captured;
}

export function makeFixtures(): RoomFixture[] {
  const silence = new Float32Array(SAMPLE_COUNT);
  const a = speech(11, 0.38);
  const b = speech(23, 0.38);
  const c = speech(37, 2.8);
  const remote = speech(43, 0.6);
  const screen = speech(53, 0.34);
  const paths: readonly Record<Talker, Path>[] = [
    { A: [1, 2], B: [0.13, 14], C: [1, 1] },
    { A: [0.56, 9], B: [1, 3], C: [0.58, 8] },
    { A: [0.36, 15], B: [0.38, 7], C: [0.3, 11] },
  ];
  const speakerPaths: readonly (readonly Path[])[] = [
    [
      [0.24, 3],
      [0.13, 9],
      [0.1, 14],
    ],
    [
      [0.13, 8],
      [0.24, 4],
      [0.15, 12],
    ],
    [
      [0.1, 15],
      [0.15, 10],
      [0.24, 2],
    ],
  ];

  function fixture({
    id,
    label,
    talkers = {},
    remoteActive = false,
    speakerMode = 'all',
    screenAudio = null,
    change,
  }: Pick<RoomFixture, 'id' | 'label' | 'change'> & {
    talkers?: Partial<Record<Talker, Float32Array>>;
    remoteActive?: boolean;
    speakerMode?: SpeakerMode;
    screenAudio?: Float32Array | null;
  }): RoomFixture {
    const microphones = new Map<string, Stems>();
    const noise = new Map<string, Float32Array>();
    const group = fixtureGroup(speakerMode);
    for (const [index, laptop] of LAPTOPS.entries()) {
      const path = paths[index];
      if (!path) throw new Error('Fixture is missing a microphone path');
      const speakerToMic = speakerPaths[index] ?? [];
      const played = remoteActive ? remote : silence;
      const echo = sumSpeakerPaths(played, speakerToMic, (speaker) => {
        const id = LAPTOPS[speaker];
        return id !== undefined && shouldPlayRoomAudio(group, id, REMOTE_MIC);
      });
      microphones.set(laptop, {
        A: throughRoom(talkers.A ?? silence, path.A),
        B: throughRoom(talkers.B ?? silence, path.B),
        C: throughRoom(talkers.C ?? silence, path.C),
        remote: echo,
      });
      const nextNoise = seededNoise(100 + index);
      noise.set(
        laptop,
        Float32Array.from(silence, () => 0.001 * nextNoise())
      );
    }
    return { id, label, speakerMode, microphones, noise, screenAudio, change };
  }

  return [
    fixture({ id: 'S1', label: 'One talker', talkers: { A: a } }),
    fixture({
      id: 'S2',
      label: 'Overlapping talkers',
      talkers: { A: a, B: b },
    }),
    fixture({
      id: 'S3',
      label: 'Explicit mute',
      talkers: { B: b },
      change: {
        at: 0,
        event: { kind: 'mic', id: LAPTOPS[1], preference: 'muted', nowMs: 0 },
      },
    }),
    fixture({
      id: 'S4',
      label: 'Designated mic unplugs',
      talkers: { A: a },
      change: {
        at: UNPLUG_SAMPLE,
        event: {
          kind: 'device-disconnected',
          id: LAPTOPS[0],
          device: 'microphone',
          nowMs: (UNPLUG_SAMPLE * 1_000) / SAMPLE_RATE,
        },
      },
    }),
    fixture({ id: 'S5', label: 'Loud clipping input', talkers: { C: c } }),
    fixture({
      id: 'S6-all',
      label: 'Remote echo, all speakers',
      remoteActive: true,
    }),
    fixture({
      id: 'S6-designated',
      label: 'Remote echo, designated speaker',
      remoteActive: true,
      speakerMode: 'designated',
    }),
    fixture({
      id: 'S7',
      label: 'Screen audio',
      talkers: { A: a },
      speakerMode: 'designated',
      screenAudio: screen,
    }),
  ];
}

function sumSpeakerPaths(
  signal: Float32Array,
  paths: readonly Path[],
  shouldPlay: (speaker: number) => boolean
): Float32Array {
  const echo = new Float32Array(SAMPLE_COUNT);
  for (const [speaker, path] of paths.entries()) {
    if (!shouldPlay(speaker)) continue;
    const copy = throughRoom(signal, path);
    for (const [index, sample] of copy.entries()) {
      echo[index] = (echo[index] ?? 0) + sample;
    }
  }
  return echo;
}
