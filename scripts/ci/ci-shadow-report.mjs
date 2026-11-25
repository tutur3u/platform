// Compares the coordinator's shadow CI plans with the runs GitHub actually
// started (apps/docs/build/devops/coordinator-ci-orchestration.mdx, slice 1).
//
//   DEPLOY_COORDINATOR_OPERATOR_TOKEN=... node scripts/ci/ci-shadow-report.mjs [--limit 10] [--json]
//
// Reads the newest registrations with the operator token (one coordinator
// call) and, per registered SHA, that commit's push runs (one GitHub API call
// through `gh`). Read-only on both sides.
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Matches RANGE_NOT_COMPUTED in scripts/ci/ci-register.mjs.
const RANGE_NOT_COMPUTED = 'range not computed: ';

export const MAX_LIMIT = 30;
const SHA = /^[0-9a-f]{40}$/u;

// What GitHub did with one workflow at one SHA.
export function actualOutcome(run) {
  if (!run) return 'not-started';
  if (run.status !== 'completed') return 'running';
  if (run.conclusion === 'cancelled') return 'cancelled';
  if (run.conclusion === 'skipped') return 'skipped';
  return 'ran';
}

// The newest push run of each workflow file for one SHA. A re-run keeps its
// run id, so the highest id is the latest started run.
export function runsByWorkflow(runs) {
  const byFile = new Map();
  for (const run of runs ?? []) {
    if (run?.event !== 'push' || typeof run.path !== 'string') continue;
    const file = run.path.replace(/^\.github\/workflows\//u, '').split('@')[0];
    const seen = byFile.get(file);
    if (!seen || run.id > seen.id) byFile.set(file, run);
  }
  return byFile;
}

const OUTCOMES = ['ran', 'skipped', 'cancelled', 'running', 'not-started'];

// Per workflow across the registrations: how often the plan would run it and
// what GitHub did. `saved` counts runs GitHub started that the plan would not
// have; `missed` counts planned runs GitHub never started.
export function compare(registrations, runsBySha) {
  const rows = new Map();
  const commits = [];
  const row = (workflow) => {
    if (!rows.has(workflow))
      rows.set(workflow, {
        workflow,
        planned: 0,
        ...Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0])),
        saved: 0,
        missed: 0,
        unplanned: 0,
      });
    return rows.get(workflow);
  };
  for (const registration of registrations) {
    const actual = runsByWorkflow(runsBySha.get(registration.sha));
    const commit = {
      sha: registration.sha,
      registeredAt: registration.registeredAt,
      planned: 0,
      started: 0,
      saved: 0,
      missed: 0,
    };
    const planned = new Set();
    for (const entry of registration.plan) {
      planned.add(entry.workflow);
      // The plan did not compute this workflow's real range; it is neither
      // a saving nor a miss.
      if (entry.reason?.startsWith(RANGE_NOT_COMPUTED)) continue;
      const target = row(entry.workflow);
      const outcome = actualOutcome(actual.get(entry.workflow));
      target[outcome] += 1;
      const started = outcome !== 'not-started';
      if (entry.run) {
        target.planned += 1;
        commit.planned += 1;
      }
      if (started) commit.started += 1;
      if (started && !entry.run) {
        target.saved += 1;
        commit.saved += 1;
      }
      if (!started && entry.run) {
        target.missed += 1;
        commit.missed += 1;
      }
    }
    for (const file of actual.keys())
      if (!planned.has(file) && file !== 'ci-register.yaml')
        row(file).unplanned += 1;
    commits.push(commit);
  }
  const workflows = [...rows.values()].sort(
    (a, b) => b.saved - a.saved || a.workflow.localeCompare(b.workflow)
  );
  const total = (key) => commits.reduce((sum, commit) => sum + commit[key], 0);
  return {
    commits,
    workflows,
    summary: {
      registrations: commits.length,
      planned: total('planned'),
      started: total('started'),
      saved: total('saved'),
      missed: total('missed'),
    },
  };
}

function table(header, rows) {
  const lines = [header, header.map(() => '---'), ...rows];
  return lines.map((cells) => `| ${cells.join(' | ')} |`).join('\n');
}

export function render(report) {
  const { summary } = report;
  const out = [
    `Shadow plan vs GitHub over ${summary.registrations} main push(es): ` +
      `${summary.planned} planned runs, ${summary.started} runs GitHub started, ` +
      `${summary.saved} started runs the plan would have saved, ` +
      `${summary.missed} planned runs GitHub never started.`,
    '',
    table(
      ['commit', 'planned', 'started', 'would save', 'missed'],
      report.commits.map((commit) => [
        commit.sha.slice(0, 10),
        commit.planned,
        commit.started,
        commit.saved,
        commit.missed,
      ])
    ),
    '',
    table(
      [
        'workflow',
        'would run',
        ...OUTCOMES,
        'would save',
        'missed',
        'unplanned',
      ],
      report.workflows
        .filter(
          (row) => row.planned || row.saved || row.missed || row.unplanned
        )
        .map((row) => [
          row.workflow,
          row.planned,
          ...OUTCOMES.map((outcome) => row[outcome]),
          row.saved,
          row.missed,
          row.unplanned,
        ])
    ),
  ];
  return out.join('\n');
}

export async function readRegistrations({ env, fetch: fetchImpl, limit }) {
  const origin = (
    env.DEPLOY_COORDINATOR_ORIGIN || 'https://deploy.tuturuuu.com'
  ).replace(/\/+$/u, '');
  if (!env.DEPLOY_COORDINATOR_OPERATOR_TOKEN)
    throw new Error('DEPLOY_COORDINATOR_OPERATOR_TOKEN is not set');
  const response = await fetchImpl(
    `${origin}/v1/ci/main/registrations?limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${env.DEPLOY_COORDINATOR_OPERATOR_TOKEN}`,
        'X-Deploy-Actor': env.DEPLOY_ACTOR || 'ci-shadow-report',
      },
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!response.ok)
    throw new Error(
      `Coordinator answered ${response.status} for registrations`
    );
  const body = await response.json();
  return (body?.registrations ?? []).filter((r) => SHA.test(r?.sha ?? ''));
}

// One `gh api` call per SHA: its push runs, up to 100.
export function ghRuns(repository, sha, gh = defaultGh) {
  const body = JSON.parse(
    gh([
      'api',
      '-X',
      'GET',
      `repos/${repository}/actions/runs`,
      '-f',
      `head_sha=${sha}`,
      '-f',
      'event=push',
      '-f',
      'per_page=100',
    ])
  );
  return body?.workflow_runs ?? [];
}

function defaultGh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 60_000,
  });
}

export function parseArgs(argv) {
  const options = { limit: 10, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--limit') {
      options.limit = Number(argv[index + 1]);
      index += 1;
    } else throw new Error(`Unknown argument ${arg}`);
  }
  if (
    !Number.isInteger(options.limit) ||
    options.limit < 1 ||
    options.limit > MAX_LIMIT
  )
    throw new Error(`--limit must be 1 to ${MAX_LIMIT}`);
  return options;
}

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  fetch: fetchImpl = globalThis.fetch,
  gh = defaultGh,
  write = (text) => process.stdout.write(`${text}\n`),
} = {}) {
  const options = parseArgs(argv);
  const registrations = await readRegistrations({
    env,
    fetch: fetchImpl,
    limit: options.limit,
  });
  const repository = env.GITHUB_REPOSITORY || 'tutur3u/platform';
  const runsBySha = new Map(
    registrations.map((registration) => [
      registration.sha,
      ghRuns(repository, registration.sha, gh),
    ])
  );
  const report = compare(registrations, runsBySha);
  write(options.json ? JSON.stringify(report, null, 2) : render(report));
  return report;
}

function invokedDirectly() {
  try {
    return (
      import.meta.url ===
      pathToFileURL(realpathSync(process.argv[1] ?? '')).href
    );
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  try {
    await main();
  } catch (error) {
    console.error(`ci-shadow-report: ${error?.message ?? error}`);
    process.exitCode = 1;
  }
}
