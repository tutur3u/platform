import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseE2eJson } from './pilot-metrics.mjs';

const suitesByFile = new Map([
  ['apps/web/e2e-agent/tasks-board-load.e2e.ts', 'tasks-kanban'],
  ['apps/web/e2e-agent/meet-guest-join.e2e.ts', 'meet-guest-join'],
  ['apps/web/e2e-agent/fleet-sign-in.e2e.ts', 'login-en-vi'],
  [
    'apps/web/e2e-agent/edufest-hall-guest-join.e2e.ts',
    'edufest-hall-guest-join',
  ],
]);
const metrics = fileURLToPath(new URL('./pilot-metrics.mjs', import.meta.url));

function maxCalls(results, serialGroups) {
  const testSteps = results.flatMap((result) =>
    result.attempts.flatMap((attempt) => attempt.steps)
  );
  const serialSteps = serialGroups.flatMap((group) =>
    group.attempts.flatMap((attempt) =>
      attempt.members.flatMap((member) => member.steps)
    )
  );
  return [...testSteps, ...serialSteps].reduce(
    (max, step) => Math.max(max, step.metrics?.modelCalls ?? 0),
    0
  );
}

export function sliceReport(report) {
  const full = parseE2eJson(report);
  const { run } = report;
  const slices = new Map(
    [...suitesByFile].map(([file, suite]) => [
      file,
      { suite, results: [], serialGroups: [] },
    ])
  );
  const groupFiles = new Map();
  for (const group of run.serialGroups) {
    const slice = slices.get(group.file);
    if (!slice) throw new Error(`Unmapped e2e file: ${group.file}`);
    groupFiles.set(group.id, group.file);
    slice.serialGroups.push(group);
  }
  for (const result of run.results) {
    const slice = slices.get(result.file);
    if (!slice) throw new Error(`Unmapped e2e file: ${result.file}`);
    const groupFile = groupFiles.get(result.serialGroupId);
    if (groupFile !== undefined && groupFile !== result.file) {
      throw new Error(
        `Serial group spans pilot suite files: ${result.serialGroupId}`
      );
    }
    slice.results.push(result);
  }
  let totalCalls = 0;
  const reports = [...slices.values()].map(
    ({ suite, results, serialGroups }) => {
      const sliced = {
        ...report,
        run: {
          ...run,
          results,
          serialGroups,
          usage: {
            ...run.usage,
            maxModelCallsInStep: maxCalls(results, serialGroups),
          },
        },
      };
      totalCalls += parseE2eJson(sliced).modelCalls;
      return { suite, report: sliced };
    }
  );
  if (totalCalls !== full.modelCalls) {
    throw new Error('Pilot suite slices do not account for all model calls');
  }
  return reports;
}

export function ciRunIdentity(report, env) {
  const { GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, PILOT_COMMIT_SHA, GITHUB_SHA } =
    env;
  const commitSha = PILOT_COMMIT_SHA || GITHUB_SHA;
  for (const [name, value] of [
    ['GITHUB_RUN_ID', GITHUB_RUN_ID],
    ['GITHUB_RUN_ATTEMPT', GITHUB_RUN_ATTEMPT],
    ['PILOT_COMMIT_SHA or GITHUB_SHA', commitSha],
  ]) {
    if (!value?.trim()) throw new Error(`Missing CI pilot metadata: ${name}`);
  }
  return {
    runId: `ci-${GITHUB_RUN_ID}-attempt-${GITHUB_RUN_ATTEMPT}`,
    timestamp: report.run.startedAt,
    commitSha,
    framework: 'e2e',
    ci: true,
  };
}

function main() {
  const report = JSON.parse(readFileSync('.e2e/report.json', 'utf8'));
  const slices = sliceReport(report);
  const identity = ciRunIdentity(report, process.env);
  const temp = mkdtempSync(join(tmpdir(), 'ci-pilot-metrics-'));
  try {
    const suites = {};
    const runs = [];
    for (const { suite, report: sliced } of slices) {
      const file = `${suite}.json`;
      writeFileSync(join(temp, file), JSON.stringify(sliced));
      suites[suite] = { workshopCritical: suite === 'edufest-hall-guest-join' };
      runs.push({ ...identity, suite, report: file });
    }
    const manifest = join(temp, 'manifest.json');
    writeFileSync(manifest, JSON.stringify({ suites, runs }));
    const result = spawnSync(
      process.execPath,
      [
        metrics,
        '--manifest',
        manifest,
        '--maintenance-log',
        '.e2e/pilot-maintenance-log.json',
        '--json-out',
        '.e2e/pilot-metrics-summary.json',
        '--assert-zero-model-calls',
      ],
      { stdio: 'inherit' }
    );
    if (result.error) throw result.error;
    return result.status ?? 1;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
