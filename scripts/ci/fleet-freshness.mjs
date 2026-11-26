// Production fleet freshness after a publication round, and the gate that
// keeps the next round from starting on top of an unacknowledged red one.
//
//   node scripts/ci/fleet-freshness.mjs summary <sha> <receipts-dir> <out.json>
//     env: FLEET_MODE=publish|rehearse, FLEET_SCOPE=all|<app>
//   node scripts/ci/fleet-freshness.mjs gate
//     env: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID, FLEET_SUMMARY_ACK
//
// Only full publish rounds name their summary job `fleet-summary`.
// Single-app dispatches use `fleet-summary-partial`, so they can neither
// clear nor set the gate.
//
// The summary reads every app in production-fleet.mjs. It fails (exit 1)
// when an auto app in scope is left stale, any publication receipt failed, a
// special app with a public build identity serves an older build whose inputs
// changed, or a manual app is past its `until` date. It never rolls anything
// back and never touches Cloudflare; it reads public build-info and git only.
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PRODUCTION_FLEET } from './production-fleet.mjs';

const SHA = /^[0-9a-f]{40}$/;
const RED = new Set(['STALE', 'FAILED', 'UNKNOWN', 'EXPIRED']);
// A pipeline still running this long, or whose previous production run did
// not succeed, is never treated as merely pending.
const PENDING_LIMIT_MINUTES = 45;
// Summary conclusions that block the next full round unless acknowledged.
const BLOCKING = new Set(['failure', 'cancelled', 'timed_out']);
const SUMMARY_JOB = 'fleet-summary';

/** Every *-serving-publication.json under `dir`, keyed by app. */
export function readReceipts(dir) {
  const receipts = {};
  if (!dir || !existsSync(dir)) return receipts;
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith('-serving-publication.json')) {
        const receipt = JSON.parse(readFileSync(file, 'utf8'));
        if (typeof receipt.app !== 'string') continue;
        // A re-run downloads every attempt's receipt: the latest one wins.
        const attempt = (r) => Number(r?.run?.attempt ?? 0);
        const known = receipts[receipt.app];
        if (!known || attempt(receipt) >= attempt(known))
          receipts[receipt.app] = receipt;
      }
    }
  };
  walk(dir);
  return receipts;
}

/**
 * One app's verdict. `live` is the build the public identity reports (null
 * when unreadable); `equivalent(live)` says whether the app's inputs are
 * unchanged between that build and the round SHA.
 */
export function verdict(
  app,
  entry,
  { sha, live, receipt, mode, scope, today, equivalent, running = new Map() }
) {
  const at = (name, reason) => ({
    app,
    class: entry.class,
    verdict: name,
    live,
    reason,
  });
  switch (entry.class) {
    case 'inactive':
      return at('INACTIVE', entry.reason);
    case 'held':
      return at('HELD', `held by policy: ${entry.reason} (${entry.owner})`);
    case 'manual':
      if (today > entry.until)
        return at(
          'EXPIRED',
          `manual publication was due to be automated by ${entry.until} (${entry.slice})`
        );
      return at('MANUAL', `automated in ${entry.slice} by ${entry.until}`);
    case 'special': {
      if (!entry.identity)
        return at('UNVERIFIED', `no public build identity; ${entry.publisher}`);
      if (live === sha) return at('FRESH', entry.publisher);
      // Its own pipeline is still publishing this SHA after the bounded wait.
      // That is pending only while the run is young and the pipeline's
      // previous production run succeeded; otherwise it is reported red.
      const pipeline = entry.pipeline && running.get(entry.pipeline);
      if (pipeline) {
        const young = pipeline.ageMinutes <= PENDING_LIMIT_MINUTES;
        if (young && pipeline.previous === 'success')
          return at(
            'PENDING',
            `${entry.pipeline} is still running for this SHA; re-run this summary when it finishes`
          );
        return at(
          'UNKNOWN',
          young
            ? `${entry.pipeline} is still running and its previous production run concluded ${pipeline.previous ?? 'unknown'}`
            : `${entry.pipeline} has been running for ${Math.round(pipeline.ageMinutes)} minutes`
        );
      }
      if (!live)
        return at('UNKNOWN', `build identity unreadable; ${entry.publisher}`);
      return equivalent(live, entry.workflow)
        ? at('FRESH-EQUIVALENT', `no input changes since ${live}`)
        : at('STALE', `serves ${live}; ${entry.publisher}`);
    }
    case 'auto': {
      if (receipt?.outcome === 'rehearsed')
        return at('REHEARSED', `candidate ${receipt.version}`);
      // Serving the SHA wins over an earlier failed receipt: a later
      // single-app dispatch may have published it, and a re-run summary
      // still downloads this run's failed receipt.
      if (live === sha) {
        const restoreFailed = receipt?.steps?.some(
          (step) => step.step === 'restore-failed'
        );
        return at(
          'FRESH',
          receipt?.outcome === 'failed'
            ? `serves the SHA after an earlier failed attempt${restoreFailed ? ' (that attempt also failed to restore serving)' : ''}`
            : (receipt?.outcome ?? 'already serving')
        );
      }
      if (receipt?.outcome === 'failed' || receipt?.outcome === 'refused')
        return at('FAILED', receipt.steps?.at(-1)?.message ?? receipt.outcome);
      const inScope = scope === 'all' || scope === app;
      if (mode === 'rehearse' || !inScope)
        return at('NOT-IN-SCOPE', `serves ${live ?? 'unknown'}`);
      if (!live) return at('UNKNOWN', 'build identity unreadable');
      return at('STALE', `serves ${live}`);
    }
    default:
      return at('UNKNOWN', `unknown class ${entry.class}`);
  }
}

export function isRed(row) {
  return RED.has(row.verdict);
}

async function readLive(url, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${url}?cb=${Date.now()}`, {
        headers: { 'cache-control': 'no-cache' },
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        const info = await response.json();
        const commit = info.commitHash ?? info.commit ?? null;
        return SHA.test(commit ?? '') ? commit : null;
      }
    } catch {}
    if (attempt < attempts)
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
  }
  return null;
}

/** Inputs unchanged between `live` and `sha`, by the planner's own rules. */
function gitEquivalent(sha) {
  return (live, workflow) => {
    if (!workflow) return false;
    const dir = mkdtempSync(
      path.join(process.env.RUNNER_TEMP || tmpdir(), 'fleet-')
    );
    try {
      const changed = execFileSync('git', ['diff', '--name-only', live, sha], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      const list = path.join(dir, 'changed.txt');
      const output = path.join(dir, 'output.txt');
      writeFileSync(list, changed);
      writeFileSync(output, '');
      execFileSync(
        'bun',
        [
          'scripts/ci/check-workflow-config.ts',
          '--workflow',
          workflow,
          '--changed-files-file',
          list,
          '--event-name',
          'push',
        ],
        {
          stdio: ['ignore', 'ignore', 'inherit'],
          env: {
            ...process.env,
            GITHUB_OUTPUT: output,
            CHANGED_BASE_SHA: live,
            CHANGED_HEAD_SHA: sha,
          },
        }
      );
      return /^should_run=false$/m.test(readFileSync(output, 'utf8'));
    } catch {
      return false;
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  };
}

export async function summarize(
  sha,
  receipts,
  {
    mode = 'publish',
    scope = 'all',
    today,
    readIdentity = readLive,
    equivalent,
    running = new Map(),
  }
) {
  const rows = [];
  for (const [app, entry] of Object.entries(PRODUCTION_FLEET)) {
    const probe =
      ['auto', 'special', 'manual'].includes(entry.class) && entry.identity;
    // Manual apps are probed once, for the report only.
    const live = probe
      ? await readIdentity(entry.identity, entry.class === 'manual' ? 1 : 3)
      : null;
    rows.push(
      verdict(app, entry, {
        sha,
        live,
        receipt: receipts[app],
        mode,
        scope,
        today,
        equivalent,
        running,
      })
    );
  }
  return rows;
}

export function render(sha, rows) {
  const red = rows.filter(isRed);
  const lines = [
    `## Production fleet freshness at ${sha.slice(0, 10)}`,
    '',
    red.length
      ? `**RED: ${red.length} app(s) need action: ${red.map((row) => row.app).join(', ')}.** The next publication round is blocked until this run is fixed or acknowledged (FLEET_SUMMARY_ACK, set by the release owner).`
      : 'Every active app in scope is fresh, equivalent, held by policy or on a dated manual path.',
    '',
    '| App | Class | Verdict | Live | Reason |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| ${row.app} | ${row.class} | ${row.verdict} | ${row.live ? row.live.slice(0, 10) : '—'} | ${String(row.reason ?? '').replaceAll('|', '/')} |`
    ),
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * The newest earlier production run whose fleet summary finished decides
 * whether this round may publish: a red one needs FLEET_SUMMARY_ACK to equal
 * its run id.
 */
export function gateDecision(runs, ack) {
  for (const run of runs) {
    if (run.summary === 'success') return { allowed: true, run: run.id };
    // A summary killed by a timeout or a cancel proves nothing, so it blocks
    // like a failure; only skipped summaries (publication off) are passed over.
    if (BLOCKING.has(run.summary))
      return String(ack ?? '') === String(run.id)
        ? { allowed: true, run: run.id, acknowledged: true }
        : { allowed: false, run: run.id };
  }
  return { allowed: true, run: null };
}

function github(env) {
  const api = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions`;
  return async (route) => {
    const response = await fetch(`${api}/${route}`, {
      headers: {
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`GitHub ${route}: ${response.status}`);
    return response.json();
  };
}

/**
 * Watched pipelines still running for `sha` on production, each with its age
 * and the conclusion of its latest completed production push run.
 */
export async function pipelineStates(get, sha, watched, now = Date.now()) {
  const { workflow_runs: runs } = await get(
    `runs?head_sha=${sha}&branch=production&event=push&per_page=100`
  );
  const states = new Map();
  for (const run of runs ?? []) {
    const name = String(run.path ?? '')
      .split('/')
      .at(-1);
    if (run.status === 'completed' || !watched.has(name) || states.has(name))
      continue;
    const started = Date.parse(run.run_started_at ?? run.created_at ?? '');
    const { workflow_runs: previous } = await get(
      `workflows/${name}/runs?branch=production&event=push&status=completed&per_page=1`
    );
    states.set(name, {
      ageMinutes: Number.isFinite(started)
        ? (now - started) / 60_000
        : Infinity,
      previous: previous?.[0]?.conclusion ?? null,
    });
  }
  return states;
}

/**
 * Wait up to `waitMinutes` for the pipelines that publish special apps, so
 * each one is judged on its own pipeline's outcome where possible.
 */
export async function settledPipelines(
  get,
  sha,
  watched,
  { waitMinutes = 10, sleep = wait, now = () => Date.now() } = {}
) {
  const deadline = now() + waitMinutes * 60_000;
  for (;;) {
    const states = await pipelineStates(get, sha, watched, now());
    if (states.size === 0 || now() >= deadline) return states;
    await sleep(60_000);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function earlierRuns(env) {
  const get = github(env);
  const { workflow_runs: listed } = await get(
    'workflows/serving-workers-production.yaml/runs?branch=production&status=completed&per_page=100'
  );
  const runs = [];
  for (const run of listed ?? []) {
    if (String(run.id) === String(env.GITHUB_RUN_ID)) continue;
    // Single-app dispatches carry "(partial" in their run
    // name and never decide the gate, so they cost no jobs read.
    if (String(run.display_title ?? '').includes('(partial')) continue;
    const { jobs } = await get(`runs/${run.id}/jobs?per_page=100`);
    const summary =
      (jobs ?? []).find((job) => job.name === SUMMARY_JOB)?.conclusion ?? null;
    runs.push({ id: run.id, summary });
    if (summary === 'success' || BLOCKING.has(summary)) break;
  }
  return runs;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'summary') {
    const [sha, receiptsDir, outFile] = args;
    if (!SHA.test(sha ?? ''))
      throw new Error('Supply the exact 40-hex production SHA');
    const rows = await summarize(sha, readReceipts(receiptsDir), {
      mode: process.env.FLEET_MODE || 'publish',
      scope: process.env.FLEET_SCOPE || 'all',
      today: new Date().toISOString().slice(0, 10),
      equivalent: gitEquivalent(sha),
      running: await settledPipelines(
        github(process.env),
        sha,
        new Set(
          Object.values(PRODUCTION_FLEET)
            .map((entry) => entry.pipeline)
            .filter(Boolean)
        )
      ).catch(() => new Map()),
    });
    const red = rows.filter(isRed);
    writeFileSync(
      outFile,
      `${JSON.stringify({ schema: 1, sha, red: red.length, rows }, null, 2)}\n`
    );
    const markdown = render(sha, rows);
    console.log(markdown);
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
    for (const row of red)
      console.log(
        `::error title=Fleet ${row.verdict}::${row.app}: ${row.reason}`
      );
    if (red.length) process.exitCode = 1;
  } else if (command === 'gate') {
    const decision = gateDecision(
      await earlierRuns(process.env),
      process.env.FLEET_SUMMARY_ACK
    );
    if (!decision.allowed) {
      console.log(
        `::error title=Fleet round blocked::run ${decision.run} ended RED; fix it or set FLEET_SUMMARY_ACK=${decision.run} (release owner)`
      );
      process.exitCode = 1;
    } else
      console.log(
        `fleet gate: open${decision.run ? ` (last summary run ${decision.run}${decision.acknowledged ? ', acknowledged' : ''})` : ''}`
      );
  } else {
    throw new Error('Usage: fleet-freshness.mjs <summary|gate> ...');
  }
}
