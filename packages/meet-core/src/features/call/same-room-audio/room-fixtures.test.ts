import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { type FixtureResult, measureFixture } from './measure-fixture';
import {
  FRAME_MS,
  MAX_LAG_MS,
  type MicStrategy,
  SAMPLE_RATE,
} from './mic-gate';
import { makeFixtures } from './room-fixtures';

const STRATEGIES: readonly MicStrategy[] = ['A', 'B', 'C'];

it('compares same-room strategies and writes fixture measurements', () => {
  const results = makeFixtures().flatMap((fixture) =>
    STRATEGIES.map((strategy) => measureFixture(fixture, strategy))
  );
  writeResults(results);

  function result(scenario: string, strategy: MicStrategy): FixtureResult {
    const row = results.find(
      (item) => item.scenario === scenario && item.strategy === strategy
    );
    if (!row) throw new Error(`Missing ${scenario}/${strategy} fixture result`);
    return row;
  }

  const baseline = result('S1', 'C');
  const deduplicated = result('S1', 'B');
  expect(baseline.duplicateEnergy).toBeGreaterThan(0);
  expect(deduplicated.duplicateEnergy).toBeLessThanOrEqual(
    0.2 * baseline.duplicateEnergy
  );
  expect(deduplicated.duplicateRatio ?? Infinity).toBeLessThanOrEqual(
    0.2 * (baseline.duplicateRatio ?? 0)
  );
  expect(result('S2', 'B').retainedPct.A ?? 0).toBeGreaterThanOrEqual(90);
  expect(result('S2', 'B').retainedPct.B ?? 0).toBeGreaterThanOrEqual(90);
  expect(result('S2', 'A').retainedPct.B ?? Infinity).toBeLessThan(10);

  for (const strategy of STRATEGIES) {
    expect(result('S3', strategy).mutedMicInputEnergy).toBeGreaterThan(0);
    expect(result('S3', strategy).mutedMicOutputEnergy).toBe(0);
    expect(result('S4', strategy).failoverRecovered).toBe(true);
    expect(result('S4', strategy).failoverGapMs).toBe(0);
    expect(result('S5', strategy).captureClippingSamples).toBeGreaterThan(0);
    expect(result('S6-designated', strategy).remoteEchoEnergy).toBeGreaterThan(
      0
    );
    expect(result('S6-designated', strategy).remoteEchoEnergy).toBeLessThan(
      result('S6-all', strategy).remoteEchoEnergy
    );
    expect(result('S7', strategy).screenAudioUnchanged).toBe(true);
  }
}, 30_000);

function writeResults(results: FixtureResult[]) {
  const configured = process.env.SAME_ROOM_RESULTS_DIR;
  const directory = configured
    ? resolve(configured)
    : mkdtempSync(join(tmpdir(), 'vitest-same-room-audio-'));
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, 'same-room-audio.json'),
    `${JSON.stringify(
      {
        sampleRateHz: SAMPLE_RATE,
        frameMs: FRAME_MS,
        maximumLagMs: MAX_LAG_MS,
        lookaheadMs: 0,
        results,
      },
      null,
      2
    )}\n`
  );

  const columns = [
    'Scenario',
    'Strategy',
    'Duplicate / primary',
    'A retained %',
    'B retained %',
    'C retained %',
    'Gate switches',
    'Added ms',
    'Capture clips',
    'Mix clips',
    'Remote echo energy',
    'Failover gap ms',
    'Muted mic output energy',
    'Screen PCM identical',
  ];
  const rows = results.map((result) => [
    `${result.scenario} ${result.label}`,
    result.strategy,
    display(result.duplicateRatio),
    display(result.retainedPct.A),
    display(result.retainedPct.B),
    display(result.retainedPct.C),
    result.switches,
    result.latencyMs,
    result.captureClippingSamples,
    result.mixClippingSamples,
    display(result.remoteEchoEnergy),
    result.failoverRecovered === false
      ? 'No recovery'
      : (result.failoverGapMs ?? '—'),
    display(result.mutedMicOutputEnergy),
    result.screenAudioUnchanged === null
      ? '—'
      : result.screenAudioUnchanged
        ? 'Yes'
        : 'No',
  ]);
  const table = [columns, columns.map(() => '---'), ...rows]
    .map((row) => `| ${row.join(' | ')} |`)
    .join('\n');
  writeFileSync(
    join(directory, 'same-room-audio.md'),
    `# Same-room audio fixtures\n\n${table}\n`
  );
  console.info(`Same-room audio results written to ${directory}`);
}

function display(value: number | null): string {
  return value === null ? '—' : value.toFixed(3);
}
