// Reproduce the release fence's single-condition mutation proof without editing source.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
assert.ok(values.out, '--out is required');
const root = dirname(fileURLToPath(import.meta.url));
const moduleName = 'wave1-native-production-resolution.mjs';
const testName = 'wave1-native-production-resolution-predicates.test.mjs';
const source = readFileSync(join(root, moduleName), 'utf8');
const resolvedRunIds = JSON.parse(
  readFileSync(join(root, 'wave1-native-production-resolutions.json'), 'utf8')
).map((record) => record.runId);
const start = source.indexOf(
  '  return (',
  source.indexOf('export function matchesFailedNoWriteResolution')
);
const end = source.indexOf('\n  );', start);
assert.ok(start > 0 && end > start);
const predicates = source
  .slice(start + '  return ('.length, end)
  .trim()
  .split(/\s+&&\s+/u);
assert.equal(
  predicates.length,
  21,
  'Update the explicit mutation inventory when the fence changes'
);
const scratch = mkdtempSync(join(tmpdir(), 'wave1-fence-mutations-'));
try {
  for (const name of [testName, 'wave1-native-production-resolutions.json'])
    cpSync(join(root, name), join(scratch, name));
  const run = () =>
    spawnSync(
      process.execPath,
      ['--test', '--test-reporter=tap', join(scratch, testName)],
      {
        cwd: scratch,
        env: {
          HOME: scratch,
          TMPDIR: scratch,
          PATH: dirname(process.execPath),
        },
        timeout: 10000,
        maxBuffer: 1024 * 1024,
        encoding: 'utf8',
      }
    );
  writeFileSync(join(scratch, moduleName), source);
  const baseline = run();
  assert.equal(
    baseline.status,
    0,
    'Unmodified predicate tests must pass before mutation'
  );
  const rows = [];
  for (const [index, predicate] of predicates.entries()) {
    const replacement = predicates
      .map((part, i) => (i === index ? 'true' : part))
      .join(' &&\n    ');
    writeFileSync(
      join(scratch, moduleName),
      `${source.slice(0, start)}  return (\n    ${replacement}${source.slice(end)}`
    );
    const result = run();
    assert.equal(
      result.error,
      undefined,
      'Mutation subprocess infrastructure failed'
    );
    const failures = [...result.stdout.matchAll(/^not ok \d+ - (.+)$/gmu)].map(
      (m) => m[1]
    );
    const expected = `predicate ${String(index + 1).padStart(2, '0')}:`;
    for (const runId of resolvedRunIds)
      assert.ok(
        result.status !== 0 &&
          failures.some(
            (name) => name.startsWith(expected) && name.endsWith(`(${runId})`)
          ),
        `Mutation ${index + 1} survived for resolved run ${runId}: ${predicate}`
      );
    rows.push({
      predicate: index + 1,
      expression: predicate.replace(/\s+/gu, ' '),
      result: 'killed',
      matchedEntries: resolvedRunIds,
      failedTests: failures,
    });
  }
  const report = {
    baseline: 'passed',
    total: rows.length,
    killed: rows.length,
    survivors: 0,
    rows,
  };
  writeFileSync(resolve(values.out), `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      baseline: report.baseline,
      killed: report.killed,
      survivors: report.survivors,
      out: resolve(values.out),
    })
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
