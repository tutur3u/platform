import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  EQUIVALENT_WORKFLOWS,
  equivalentAncestors,
  equivalentCandidates,
  externalReferences,
  runExecuted,
  readWorkspaceManifests,
  workspaceClosure,
} from './release-relevant-ci.mjs';

const SHA = /^[a-f0-9]{40}$/;
// Meet's own validation and the security checks must be green on the exact
// source. CodeQL is not a release gate: the push scan and the nightly full
// scan surface new results without holding a release.
const exactWorkflows = ['security-checks.yaml', 'meet-cloudflare.yaml'];
// Repository-wide checks also accept a green run on a nearby main commit
// when Meet's workspace closure is identical (release-relevant-ci.mjs).
const sharedWorkflows = EQUIVALENT_WORKFLOWS;

/**
 * Release-authority risk acceptances for repository-wide workflows that are
 * red only outside Meet's closure. Each names its authority record, the exact
 * source, the covered shared workflows and an expiry. Meet's own and the
 * security workflows are never covered, and the covered run must have
 * executed and failed on the exact source.
 */
export const RELEASE_EXCEPTIONS = [
  {
    // Root script contracts red outside Meet's closure; Meet, security and
    // type-check green on this source.
    id: 'RA-20261121-1240-MEET-UNIT',
    source: '351d130d3faef22d890485b576767abe47bbb185',
    workflows: ['turbo-unit-tests.yaml'],
    expires: '2026-11-22T16:59:00Z',
    // Follow-up owned by the Meet release owner: AT-9(h)
    // (scripts/meet-erase-inventory.test.mjs) flags changed
    // workspace_documents-history audit references. Review the S-DH fence
    // against the commit that changed them before fixing forward or updating
    // the inventory (never a blind regeneration), with independent review.
    // Attendance stays disabled everywhere until AT-9(h) is green.
    followUp: 'AT-9(h) S-DH fence review; attendance off until green',
  },
  {
    // Known root-script and utils drift, same signatures as the Prod lane
    // record. Security and Meet Cloudflare, including validate, are green
    // on this source. Expires 2026-11-22 23:59 ICT.
    id: 'RA-20261122-0010-TEST-DRIFT-5',
    source: 'a6acf0e3affd1bb6bc91ce203d18beaf4fa4bd40',
    workflows: ['turbo-unit-tests.yaml'],
    expires: '2026-11-22T16:59:00Z',
    followUp:
      'Root-script 6133, 6135-6138, 6276, 6581, 6940, 6950 and utils commercial-comparison. No Meet runtime failure.',
  },
  {
    // Known-drift Test failures only, same names as the Prod lane list at
    // 0f7d0d58. Security, Meet Cloudflare, TypeScript and Oxc stay required.
    // Expires 2026-11-22 23:59 ICT.
    id: 'RA-20261122-0410-MEET-REL',
    source: '89f8b2ffb6cc48fdd05dd138180c300657e42d51',
    workflows: ['turbo-unit-tests.yaml'],
    expires: '2026-11-22T16:59:00Z',
    followUp:
      'Root 6143, 6145-6148, 6287, 6592, 7002, 7012; utils commercial-comparison; Mail HSTS 6778. CLI publish-count ratchet 6292 is fixed and is not waived. Any other Test failure is outside this grant.',
  },
  {
    // Release-authority exception (Iris, 23 Nov 2026; USER rule "ship all,
    // fix forward"). Red only outside Meet's closure on this source: Type
    // Check fails only @tuturuuu/playground-execution (TS2307), and Test fails
    // root-script 782, 6374, 6771, 7007, 7760, 8042 plus utils
    // commercial-comparison and app-coordination token consumers. Security
    // Checks and Meet Cloudflare stay required on this exact source.
    id: 'RA-20261123-1100-MEET-A-PRIME',
    source: '346ba247f222f7b652512c02e8c138270221b016',
    workflows: ['turbo-unit-tests.yaml', 'type-check.yaml'],
    expires: '2026-11-23T16:59:00Z',
    followUp:
      'Playground lane: playground-execution type-check, docs page, extra-edges 782, workers_dev 6374. Other root/utils drift to its owners. Any other failure is outside this grant.',
  },
  {
    // Release-authority exception (Iris, 23 Nov 2026) for the private Mira
    // Live-socket origin hotfix. Same non-Meet reds as A-PRIME: Type Check
    // fails only @tuturuuu/playground-execution, and Test fails the known
    // root-script and utils drift. Security Checks and Meet Cloudflare stay
    // required on this exact source.
    id: 'RA-20261123-1300-MEET-LIVE-ORIGIN',
    source: 'a99c13124f03ec8a5914bc9d72b3da934f1d2731',
    workflows: ['turbo-unit-tests.yaml', 'type-check.yaml'],
    expires: '2026-11-23T16:59:00Z',
    followUp:
      'Same owners as RA-20261123-1100-MEET-A-PRIME. Any other failure is outside this grant.',
  },
  {
    // Release-authority exception (Iris, 23 Nov 2026): calm join and ended
    // screens, activities tidy and strict classroom limits.
    // Same non-Meet reds as RA-20261123-1100-MEET-A-PRIME: Type Check fails
    // only @tuturuuu/playground-execution, and Test fails the known root
    // script drift. Security Checks and Meet Cloudflare stay required on
    // this exact source.
    id: 'RA-20261123-1400-MEET-UX-LIMITS',
    source: '53528ad4a74622f3216ed166460ca5f655c48b12',
    workflows: ['turbo-unit-tests.yaml', 'type-check.yaml'],
    expires: '2026-11-23T16:59:00Z',
    followUp:
      'Same owners as RA-20261123-1100-MEET-A-PRIME. Any other failure is outside this grant.',
  },
  {
    // Release-authority exception (Iris, 23 Nov 2026): VIP shared screen
    // focus view.
    // Same non-Meet reds as RA-20261123-1100-MEET-A-PRIME: Type Check fails
    // only @tuturuuu/playground-execution, and Test fails the known root
    // script drift. Security Checks and Meet Cloudflare stay required on
    // this exact source.
    id: 'RA-20261123-1440-MEET-FOCUS-VIEW',
    source: 'adc9721ba5647893dd4ffc7886b2e62f5fd81392',
    workflows: ['turbo-unit-tests.yaml', 'type-check.yaml'],
    expires: '2026-11-23T16:59:00Z',
    followUp:
      'Same owners as RA-20261123-1100-MEET-A-PRIME. Any other failure is outside this grant.',
  },
  {
    // Release-authority exception (Iris, 23 Nov 2026): Meet SEO and link
    // preview revamp.
    // Same non-Meet reds as RA-20261123-1100-MEET-A-PRIME: Type Check fails
    // only @tuturuuu/playground-execution, and Test fails the known root
    // script drift. Security Checks and Meet Cloudflare stay required on
    // this exact source.
    id: 'RA-20261123-1530-MEET-SEO-OG',
    source: '4fa38b146f24e018c5cd093943ce022287d7f86e',
    workflows: ['turbo-unit-tests.yaml', 'type-check.yaml'],
    expires: '2026-11-23T16:59:00Z',
    followUp:
      'Same owners as RA-20261123-1100-MEET-A-PRIME. Any other failure is outside this grant.',
  },
  {
    // Test is red only on four root-script and utils tests outside Meet's
    // closure; the release authority accepted that risk for this source.
    // Type Check, Security Checks and Meet Cloudflare stay required here.
    id: 'RA-20261123-1900-MEET-S9B-OG-QA',
    source: 'b306fa7092a94fb5179b6dd774d2001e754f6464',
    workflows: ['turbo-unit-tests.yaml'],
    expires: '2026-11-23T16:59:00Z',
    followUp:
      'Root-script and utils test fix lands before production sync. Any other failure is outside this grant.',
  },
  {
    // Safari guests are blocked at the Turnstile join check until this source
    // ships. Test is red only on the known root-script and utils drift outside
    // Meet's closure. Type Check, Security Checks and Meet Cloudflare stay
    // required on this exact source.
    id: 'RA-20261123-1915-MEET-SAFARI-TURNSTILE',
    source: 'b6eb07b20b039812807609d196f58032c9534f65',
    workflows: ['turbo-unit-tests.yaml'],
    expires: '2026-11-23T16:59:00Z',
    followUp:
      'Same owners as RA-20261123-1900-MEET-S9B-OG-QA. Any other failure is outside this grant.',
  },
];

export function releaseException(
  source,
  workflow,
  now,
  exceptions = RELEASE_EXCEPTIONS
) {
  if (!sharedWorkflows.includes(workflow)) return undefined;
  return exceptions.find(
    (exception) =>
      typeof exception.id === 'string' &&
      exception.id.length > 0 &&
      SHA.test(exception.source ?? '') &&
      exception.source === source &&
      Array.isArray(exception.workflows) &&
      exception.workflows.includes(workflow) &&
      Number.isFinite(Date.parse(exception.expires)) &&
      Date.parse(exception.expires) > now
  );
}
// At most this many equivalent commits have their run's jobs read.
const MAX_EXECUTION_READS = 3;
// A page of 40 main workflow runs is about 0.5 MiB and grows with run
// metadata; keep reads bounded with headroom.
export const MAX_READ_BYTES = 2 * 1024 * 1024;
const workflows = [...sharedWorkflows, ...exactWorkflows];

function stop(code) {
  throw Object.assign(new Error(code), { guardCode: code });
}

/**
 * A production push publishes its own head. A main dispatch publishes its
 * pinned `source_sha`, which need not be main's head: admission still
 * requires the checkout to be that commit, the commit to be on main and its
 * exact-source CI to be green, so a busy main cannot strand a release.
 */
export function validateInvocation(env) {
  if (env.GITHUB_REPOSITORY !== 'tutur3u/platform')
    stop('MEET_RELEASE_REPOSITORY');
  if (!SHA.test(env.SOURCE_SHA ?? '')) stop('MEET_RELEASE_SOURCE');
  if (env.GITHUB_REF === 'refs/heads/production') {
    if (env.SOURCE_SHA !== env.GITHUB_SHA) stop('MEET_RELEASE_SOURCE');
    return;
  }
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

/** The newest main push or dispatch run of a workflow on the exact source. */
export function latestWorkflowRun(payload, source, currentRun) {
  if (!Array.isArray(payload?.workflow_runs)) stop('MEET_RELEASE_CI_RESPONSE');
  return payload.workflow_runs
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
    )[0];
}

export function admitWorkflowRuns(payload, source, currentRun) {
  const latest = latestWorkflowRun(payload, source, currentRun);
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
  if (text.length > MAX_READ_BYTES) stop('MEET_RELEASE_READ_TOO_LARGE');
  return JSON.parse(text);
}

export async function admitRelease({
  env = process.env,
  run = execFileSync,
  fetcher = fetch,
  now = Date.now,
  exceptions = RELEASE_EXCEPTIONS,
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
        maxBuffer: 16 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    phase = 'ancestry';
    const head = git(['rev-parse', 'HEAD']);
    if (head !== env.SOURCE_SHA) {
      // The policy job runs this script from main's dispatch head; the jobs
      // that build and publish check out the pinned source itself.
      if (env.GITHUB_REF !== 'refs/heads/main' || head !== env.GITHUB_SHA)
        stop('MEET_RELEASE_CHECKOUT');
      git(['cat-file', '-e', `${env.SOURCE_SHA}^{commit}`]);
    }
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
    const runsUrl = (workflow, query) =>
      `https://api.github.com/repos/tutur3u/platform/actions/workflows/${workflow}/runs?${query}`;
    const exactRuns = async (workflow, sha) =>
      admitWorkflowRuns(
        await readJson(
          runsUrl(workflow, `head_sha=${sha}&per_page=100`),
          env.GH_TOKEN,
          fetcher
        ),
        sha,
        env.GITHUB_RUN_ID
      );
    let closure;
    let references;
    for (const workflow of workflows) {
      try {
        checks[workflow] = await exactRuns(workflow, env.SOURCE_SHA);
        continue;
      } catch (error) {
        if (
          error.guardCode !== 'MEET_RELEASE_CI_NOT_GREEN' ||
          !sharedWorkflows.includes(workflow)
        )
          throw error;
      }
      closure ??= workspaceClosure(
        'apps/meet',
        readWorkspaceManifests(git, env.SOURCE_SHA)
      );
      references ??= externalReferences(git, env.SOURCE_SHA, closure);
      const candidates = equivalentCandidates(
        await readJson(
          runsUrl(workflow, 'branch=main&status=success&per_page=40'),
          env.GH_TOKEN,
          fetcher
        ),
        env.SOURCE_SHA,
        env.GITHUB_RUN_ID
      );
      const ancestors = equivalentAncestors({
        candidates,
        closure,
        git,
        references,
        source: env.SOURCE_SHA,
        workflow,
      }).slice(0, MAX_EXECUTION_READS);
      for (const { sha, distance } of ancestors) {
        // The commit's newest run must itself be green and must have run its
        // checks rather than skipping them.
        let admitted;
        try {
          admitted = await exactRuns(workflow, sha);
        } catch (error) {
          if (error.guardCode === 'MEET_RELEASE_CI_NOT_GREEN') continue;
          throw error;
        }
        const jobs = await readJson(
          `https://api.github.com/repos/tutur3u/platform/actions/runs/${admitted.id}/attempts/${admitted.attempt}/jobs?per_page=100`,
          env.GH_TOKEN,
          fetcher
        );
        if (!runExecuted(workflow, jobs)) continue;
        checks[workflow] = { ...admitted, equivalentSha: sha, distance };
        break;
      }
      if (checks[workflow]) continue;
      const exception = releaseException(
        env.SOURCE_SHA,
        workflow,
        now(),
        exceptions
      );
      if (!exception) stop('MEET_RELEASE_CI_NOT_GREEN');
      const covered = latestWorkflowRun(
        await readJson(
          runsUrl(workflow, `head_sha=${env.SOURCE_SHA}&per_page=100`),
          env.GH_TOKEN,
          fetcher
        ),
        env.SOURCE_SHA,
        env.GITHUB_RUN_ID
      );
      // Only a run that executed and failed is covered; cancelled, skipped or
      // unstarted runs prove nothing about the tests.
      if (covered?.status !== 'completed' || covered.conclusion !== 'failure')
        stop('MEET_RELEASE_CI_NOT_GREEN');
      checks[workflow] = {
        id: covered.id,
        attempt: covered.run_attempt,
        conclusion: covered.conclusion,
        exception: exception.id,
        expires: exception.expires,
      };
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
