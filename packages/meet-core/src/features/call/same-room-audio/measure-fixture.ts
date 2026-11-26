import { shouldPlayRoomAudio, stepRoomAudioGroup } from './group';
import {
  algorithmicLatencyMs,
  FRAME_MS,
  FRAME_SAMPLES,
  type MicStrategy,
  RoomMicGate,
} from './mic-gate';
import {
  fixtureGroup,
  LAPTOPS,
  REMOTE,
  type RoomFixture,
  SAMPLE_COUNT,
  TALKERS,
} from './room-fixtures';

type TalkerEnergy = Record<(typeof TALKERS)[number], number>;

export type FixtureResult = ReturnType<typeof measureFixture>;

export function measureFixture(fixture: RoomFixture, strategy: MicStrategy) {
  const gate = new RoomMicGate(strategy);
  let group = fixtureGroup(fixture.speakerMode);
  let previous: ReadonlySet<string> | undefined;
  let switches = 0;
  let duplicateEnergy = 0;
  let remoteEchoEnergy = 0;
  let captureClippingSamples = 0;
  let mixClippingSamples = 0;
  let mutedMicInputEnergy = 0;
  let mutedMicOutputEnergy = 0;
  const retained: TalkerEnergy = { A: 0, B: 0, C: 0 };
  const reference: TalkerEnergy = { A: 0, B: 0, C: 0 };
  const unplug =
    fixture.change?.event.kind === 'device-disconnected'
      ? fixture.change.at
      : undefined;
  let failoverGapMs = 0;
  let recovered = false;

  for (let start = 0; start < SAMPLE_COUNT; start += FRAME_SAMPLES) {
    if (fixture.change?.at === start) {
      group = stepRoomAudioGroup(group, fixture.change.event);
    }
    if (group.kind !== 'active') throw new Error('Fixture membership expired');
    const captures = group.members.flatMap(({ id, devices, mic }) => {
      const stems = fixture.microphones.get(id);
      const noise = fixture.noise.get(id);
      if (!devices.microphone || !stems || !noise) return [];
      return [{ id, mic, ...captureFrame(stems, noise, start) }];
    });
    const passing = gate.step(
      group,
      new Map(captures.map(({ id, pcm }) => [id, pcm]))
    );

    if (previous) {
      for (const id of LAPTOPS) {
        if (previous.has(id) !== passing.has(id)) switches++;
      }
    }
    previous = passing;

    const output = captures.filter(({ id }) => passing.has(id));
    let talkerOutput = 0;
    let talkerReference = 0;
    for (const talker of TALKERS) {
      const bestAvailable = Math.max(
        0,
        ...captures.map(({ talkers }) => talkers[talker])
      );
      const copies = output.map(({ talkers }) => talkers[talker]);
      const bestRetained = Math.max(0, ...copies);
      const copyEnergy = copies.reduce((total, energy) => total + energy, 0);
      duplicateEnergy += copyEnergy - bestRetained;
      retained[talker] += bestRetained;
      reference[talker] += bestAvailable;
      talkerOutput += bestRetained;
      talkerReference += bestAvailable;
    }

    if (
      unplug !== undefined &&
      start >= unplug &&
      !recovered &&
      talkerReference > 0.01
    ) {
      recovered = talkerOutput >= 0.1 * talkerReference;
      if (!recovered) failoverGapMs += FRAME_MS;
    }

    for (const capture of captures) {
      if (capture.mic === 'enabled')
        captureClippingSamples += capture.clippingSamples;
      if (capture.mic === 'muted') {
        mutedMicInputEnergy += energy(capture.pcm);
        if (passing.has(capture.id))
          mutedMicOutputEnergy += energy(capture.pcm);
      }
    }
    for (let sample = 0; sample < FRAME_SAMPLES; sample++) {
      let mix = 0;
      let echo = 0;
      for (const capture of output) {
        mix += capture.pcm[sample] ?? 0;
        echo += capture.echo[sample] ?? 0;
      }
      if (Math.abs(mix) >= 1) mixClippingSamples++;
      remoteEchoEnergy += echo ** 2;
    }
  }

  const primaryEnergy = TALKERS.reduce(
    (total, talker) => total + retained[talker],
    0
  );
  return {
    scenario: fixture.id,
    label: fixture.label,
    strategy,
    duplicateEnergy,
    duplicateRatio: primaryEnergy > 0 ? duplicateEnergy / primaryEnergy : null,
    retainedPct: {
      A: percent(retained.A, reference.A),
      B: percent(retained.B, reference.B),
      C: percent(retained.C, reference.C),
    },
    switches,
    latencyMs: algorithmicLatencyMs(strategy),
    captureClippingSamples,
    mixClippingSamples,
    remoteEchoEnergy,
    failoverGapMs: unplug === undefined || !recovered ? null : failoverGapMs,
    failoverRecovered: unplug === undefined ? null : recovered,
    mutedMicInputEnergy,
    mutedMicOutputEnergy,
    screenAudioUnchanged:
      fixture.screenAudio === null
        ? null
        : screenIsUnchanged(fixture.screenAudio, group),
  };
}

function captureFrame(
  stems: NonNullable<ReturnType<RoomFixture['microphones']['get']>>,
  noise: Float32Array,
  start: number
) {
  const pcm = new Float32Array(FRAME_SAMPLES);
  const echo = new Float32Array(FRAME_SAMPLES);
  const talkers: TalkerEnergy = { A: 0, B: 0, C: 0 };
  let clippingSamples = 0;
  for (let index = 0; index < FRAME_SAMPLES; index++) {
    const sample = start + index;
    const a = stems.A[sample] ?? 0;
    const b = stems.B[sample] ?? 0;
    const c = stems.C[sample] ?? 0;
    const remote = stems.remote[sample] ?? 0;
    const raw = a + b + c + remote + (noise[sample] ?? 0);
    const gain = 1 / Math.max(1, Math.abs(raw));
    if (Math.abs(raw) >= 1) clippingSamples++;
    pcm[index] = raw * gain;
    echo[index] = remote * gain;
    talkers.A += (a * gain) ** 2;
    talkers.B += (b * gain) ** 2;
    talkers.C += (c * gain) ** 2;
  }
  return { pcm, echo, talkers, clippingSamples };
}

function energy(pcm: Float32Array): number {
  return pcm.reduce((total, sample) => total + sample ** 2, 0);
}

function percent(retained: number, reference: number): number | null {
  return reference > 0 ? (100 * retained) / reference : null;
}

function screenIsUnchanged(
  pcm: Float32Array,
  group: ReturnType<typeof fixtureGroup>
): boolean {
  const screen = {
    kind: 'screen',
    publisherId: LAPTOPS[0],
    muted: false,
  } as const;
  const original = pcm.slice();
  return [...LAPTOPS, REMOTE].every((listenerId) => {
    const played = shouldPlayRoomAudio(group, listenerId, screen) ? pcm : null;
    return (
      played?.every((sample, index) => sample === original[index]) === true
    );
  });
}
