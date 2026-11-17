import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const workflows = [
  'type-check.yaml',
  'security-checks.yaml',
  'turbo-unit-tests.yaml',
  'codeql.yml',
  'oxc-check.yaml',
  'meet-cloudflare.yaml',
];

function stop(code) {
  throw Object.assign(new Error(code), { guardCode: code });
}

export function validateInvocation(env) {
  if (env.GITHUB_REPOSITORY !== 'tutur3u/platform')
    stop('MEET_RELEASE_REPOSITORY');
  if (!SHA.test(env.SOURCE_SHA ?? '') || env.SOURCE_SHA !== env.GITHUB_SHA)
    stop('MEET_RELEASE_SOURCE');
  if (env.GITHUB_REF === 'refs/heads/production') return;
  if (
    env.GITHUB_REF !== 'refs/heads/main' ||
    env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    env.EXPECTED_SOURCE_SHA !== env.SOURCE_SHA
  )
    stop('MEET_RELEASE_DISPATCH');
}

export function validateProductionProducer(source, env) {
  if (env.GITHUB_REF === 'refs/heads/production') return;
  if (env.MEET_PRODUCTION !== 'true') stop('MEET_RELEASE_PRODUCER_INTENT');
  validateInvocation({ ...env, SOURCE_SHA: source });
}

export function productionIntent(env) {
  validateProductionProducer(env.SOURCE_SHA, env);
  return {
    source: env.SOURCE_SHA,
    ref: env.GITHUB_REF,
    event: env.GITHUB_EVENT_NAME,
    expectedSource: env.EXPECTED_SOURCE_SHA || null,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
  };
}

export function bindProductionIntent(mode, env = process.env) {
  const receiptPath = join(env.RUNNER_TEMP, 'meet-production-receipt.json');
  const intentPath = join(env.RUNNER_TEMP, 'meet-release-intent.json');
  const bound = {
    ...productionIntent(env),
    graphReceiptHash: createHash('sha256')
      .update(readFileSync(receiptPath))
      .digest('hex'),
  };
  if (mode === 'bind')
    writeFileSync(intentPath, JSON.stringify(bound), {
      flag: 'wx',
      mode: 0o600,
    });
  else {
    const saved = JSON.parse(readFileSync(intentPath, 'utf8'));
    const attempt = Number(saved.runAttempt);
    if (
      !Number.isSafeInteger(attempt) ||
      attempt < 1 ||
      attempt > Number(env.GITHUB_RUN_ATTEMPT)
    )
      stop('MEET_RELEASE_PROVENANCE_ATTEMPT');
    if (
      JSON.stringify(saved) !==
      JSON.stringify({ ...bound, runAttempt: saved.runAttempt })
    )
      stop('MEET_RELEASE_PROVENANCE_MISMATCH');
  }
}

export function liveSource(metadata) {
  if (
    metadata?.appName !== 'meet' ||
    metadata.environment !== 'production' ||
    metadata.refName !== 'production' ||
    !SHA.test(metadata.commitHash ?? '')
  )
    stop('MEET_RELEASE_LIVE_IDENTITY');
  return metadata.commitHash;
}

export function admissionOutputs(result) {
  const live = SHA.test(result.live ?? '') ? `live=${result.live}\n` : '';
  return `superseded=${result.guardCode === 'MEET_RELEASE_SUPERSEDED'}\n${live}`;
}

export function admitWorkflowRuns(payload, source, currentRun) {
  if (!Array.isArray(payload?.workflow_runs)) stop('MEET_RELEASE_CI_RESPONSE');
  const runs = payload.workflow_runs
    .filter(
      (run) =>
        run.head_sha === source &&
        String(run.id) !== String(currentRun) &&
        run.repository?.full_name === 'tutur3u/platform' &&
        run.head_repository?.full_name === 'tutur3u/platform' &&
        run.head_branch === 'main' &&
        ['push', 'workflow_dispatch'].includes(run.event)
    )
    .sort(
      (a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt
    );
  const latest = runs[0];
  if (
    !latest ||
    latest.status !== 'completed' ||
    latest.conclusion !== 'success'
  )
    stop('MEET_RELEASE_CI_NOT_GREEN');
  return { id: latest.id, attempt: latest.run_attempt };
}

async function readJson(url, token, fetcher) {
  const response = await fetcher(url, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        }
      : { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) stop('MEET_RELEASE_READ_FAILED');
  const text = await response.text();
  if (text.length > 512 * 1024) stop('MEET_RELEASE_READ_TOO_LARGE');
  return JSON.parse(text);
}

export async function admitRelease({
  env = process.env,
  run = execFileSync,
  fetcher = fetch,
  receipt = (value) => {
    if (env.RUNNER_TEMP)
      writeFileSync(
        join(env.RUNNER_TEMP, 'meet-release-admission.json'),
        JSON.stringify(value)
      );
  },
} = {}) {
  let phase = 'invocation';
  try {
    validateInvocation(env);
    if (!env.GH_TOKEN) stop('MEET_RELEASE_CI_CREDENTIAL');
    const git = (args) =>
      run('git', args, {
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    phase = 'ancestry';
    if (git(['rev-parse', 'HEAD']) !== env.SOURCE_SHA)
      stop('MEET_RELEASE_CHECKOUT');
    git(['fetch', '--no-tags', 'origin', 'main']);
    git(['merge-base', '--is-ancestor', env.SOURCE_SHA, 'FETCH_HEAD']);
    phase = 'live-identity';
    const live = liveSource(
      await readJson('https://meet.tuturuuu.com/api/build-info', null, fetcher)
    );
    const isAncestor = (older, newer) => {
      try {
        git(['merge-base', '--is-ancestor', older, newer]);
        return true;
      } catch (error) {
        if (error.status === 1) return false;
        throw error;
      }
    };
    const superseded =
      live === env.SOURCE_SHA || !isAncestor(live, env.SOURCE_SHA);
    if (superseded) {
      if (live !== env.SOURCE_SHA && !isAncestor(env.SOURCE_SHA, live))
        stop('MEET_RELEASE_DIVERGENT');
      if (env.GITHUB_REF !== 'refs/heads/production')
        stop(
          live === env.SOURCE_SHA
            ? 'MEET_RELEASE_ALREADY_LIVE'
            : 'MEET_RELEASE_STALE'
        );
      const result = {
        guardCode: 'MEET_RELEASE_SUPERSEDED',
        phase: 'complete',
        source: env.SOURCE_SHA,
        live,
      };
      receipt(result);
      return result;
    }
    phase = 'ci';
    const checks = {};
    for (const workflow of workflows) {
      const url = `https://api.github.com/repos/tutur3u/platform/actions/workflows/${workflow}/runs?head_sha=${env.SOURCE_SHA}&per_page=100`;
      checks[workflow] = admitWorkflowRuns(
        await readJson(url, env.GH_TOKEN, fetcher),
        env.SOURCE_SHA,
        env.GITHUB_RUN_ID
      );
    }
    const result = {
      guardCode: 'MEET_RELEASE_ADMITTED',
      phase: 'complete',
      source: env.SOURCE_SHA,
      live,
      checks,
    };
    receipt(result);
    return result;
  } catch (error) {
    const result = {
      guardCode: error.guardCode ?? 'MEET_RELEASE_OPERATION_FAILED',
      phase,
    };
    receipt(result);
    throw Object.assign(new Error(`${result.guardCode}:${phase}`), result);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const action = ['bind', 'verify'].includes(process.argv[2])
    ? Promise.resolve().then(() => bindProductionIntent(process.argv[2]))
    : admitRelease();
  action
    .then((result) => {
      if (process.env.GITHUB_OUTPUT && result)
        appendFileSync(process.env.GITHUB_OUTPUT, admissionOutputs(result));
      console.log(result?.guardCode ?? 'MEET_RELEASE_ADMITTED');
    })
    .catch((error) => {
      const result = {
        guardCode: error.guardCode ?? 'MEET_RELEASE_OPERATION_FAILED',
        phase: error.phase ?? 'provenance',
      };
      if (process.env.RUNNER_TEMP)
        writeFileSync(
          join(process.env.RUNNER_TEMP, 'meet-release-stop.json'),
          JSON.stringify(result)
        );
      console.error(result.guardCode);
      process.exitCode = 1;
    });
}
