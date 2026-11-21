// Refuses to replace a live tuturuuu.com gateway with an older build.
//
// web-opennext.yaml deploys the gateway on every production push, but the
// gateway is also deployed from newer main commits. The serving version's
// message records its build commit (`gateway <sha> ...`); GitHub relates it
// to the job's commit:
//   behind     the live gateway is an ancestor of the job's commit: deploy;
//   identical  the live gateway is already this commit: skip;
//   ahead      the live gateway is a descendant (newer): skip;
//   diverged   neither contains the other: skip.
// An unparseable message or an unknown commit fails closed (skip), unless a
// workflow_dispatch input explicitly forces the unparseable case.
//
// usage: gateway-no-downgrade.mjs <settings.json>
// env:   TARGET_SHA, GITHUB_REPOSITORY, GITHUB_TOKEN, GATEWAY_FORCE_UNPARSEABLE,
//        GITHUB_OUTPUT (receives deploy=true|false and reason=<code>)
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { versionCommit } from './verify-cloudflare-web-production.mjs';

const fullSha = /^[0-9a-f]{40}$/;

/** The 40-hex build commit in a gateway version message, or null. */
export function servingCommit(message) {
  let commit;
  try {
    commit = versionCommit(
      { annotations: { 'workers/message': message } },
      { kind: 'gateway' }
    );
  } catch {
    return null;
  }
  return typeof commit === 'string' && fullSha.test(commit) ? commit : null;
}

/**
 * Whether to deploy. `status` is GitHub's compare status for
 * `<target>...<serving>`, i.e. how the serving commit relates to the target.
 */
export function decide({ serving, target, status, force = false }) {
  if (!serving)
    return force
      ? { deploy: true, reason: 'unparseable-forced' }
      : { deploy: false, reason: 'unparseable' };
  if (serving === target || status === 'identical')
    return { deploy: false, reason: 'same' };
  if (status === 'behind') return { deploy: true, reason: 'live-behind' };
  if (status === 'ahead') return { deploy: false, reason: 'live-ahead' };
  if (status === 'diverged') return { deploy: false, reason: 'diverged' };
  return { deploy: false, reason: 'unknown-commit' };
}

const NOTICES = {
  'unparseable-forced':
    'The serving gateway message has no build commit; deploying because the run forced it.',
  'live-behind':
    'The serving gateway is an ancestor of this commit; deploying.',
  unparseable:
    'The serving gateway message has no build commit; skipping the gateway deploy (fail closed). Rerun with workflow_dispatch gateway-force-unparseable to override.',
  same: 'The serving gateway is already this commit; skipping the gateway deploy.',
  'live-ahead':
    'The live gateway is ahead of this commit; skipping the gateway deploy to avoid a downgrade.',
  diverged:
    'The serving gateway commit diverged from this commit; skipping the gateway deploy.',
  'unknown-commit':
    'The serving gateway commit is not related to this commit on GitHub; skipping the gateway deploy.',
};

const repoName = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/**
 * GitHub's compare status for `<base>...<head>`. Only two validated commit
 * SHAs and the owner/name repository slug reach the request: nothing else
 * from the settings file is sent.
 */
export async function githubCompare({
  repo,
  base,
  head,
  token,
  fetchImpl = fetch,
}) {
  // The URL uses only values assigned when their anchored pattern matched.
  const slug = typeof repo === 'string' && repoName.test(repo) ? repo : '';
  if (!slug) throw new Error('GITHUB_REPOSITORY is not an owner/name slug');
  const baseSha = typeof base === 'string' && fullSha.test(base) ? base : '';
  const headSha = typeof head === 'string' && fullSha.test(head) ? head : '';
  if (!baseSha || !headSha)
    throw new Error('compare refs must be full commit SHAs');
  const [owner, name] = slug.split('/');
  const url = new URL(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/compare/${baseSha}...${headSha}`
  );
  url.searchParams.set('per_page', '1');
  const response = await fetchImpl(url, {
    redirect: 'error',
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  // A commit GitHub does not know cannot be related: fail closed.
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`GitHub compare failed with HTTP ${response.status}`);
  return (await response.json())?.status ?? null;
}

export async function evaluate({
  settings,
  target,
  repo,
  token,
  force,
  compare = githubCompare,
}) {
  if (!fullSha.test(target ?? '')) throw new Error('TARGET_SHA is not a sha');
  const serving = servingCommit(settings?.result?.message);
  const status =
    serving && serving !== target
      ? await compare({ repo, base: target, head: serving, token })
      : null;
  return { serving, ...decide({ serving, target, status, force }) };
}

async function main([settingsPath]) {
  const env = process.env;
  const message = JSON.parse(readFileSync(settingsPath, 'utf8'))?.result
    ?.message;
  const result = await evaluate({
    settings: {
      result: { message: typeof message === 'string' ? message : '' },
    },
    target: env.TARGET_SHA,
    repo: env.GITHUB_REPOSITORY,
    token: env.GITHUB_TOKEN,
    force: env.GATEWAY_FORCE_UNPARSEABLE === 'true',
  });
  console.log(
    `::notice title=Gateway no-downgrade guard::${NOTICES[result.reason]} (serving ${result.serving ?? 'unknown'}, target ${env.TARGET_SHA})`
  );
  if (env.GITHUB_OUTPUT)
    appendFileSync(
      env.GITHUB_OUTPUT,
      `deploy=${result.deploy}\nreason=${result.reason}\n`
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main(process.argv.slice(2)).catch((error) => {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  });
