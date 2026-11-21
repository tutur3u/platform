// Serving-worker publisher:
//   node scripts/ci/serving-workers.mjs plan <sha>
//   node scripts/ci/serving-workers.mjs restore <app> <sha> <artifact-dir> <cf-output-dir>
//   node scripts/ci/serving-workers.mjs publish <app> <sha> <cf-output-dir>
//
// Republishes an already-serving Worker from the sealed artifact its own
// workflow built at the exact production SHA, through the cf Build Output path
// (void-cf-output.mjs, void-cf-publisher.mjs). Each publish:
// - stops unless the stop fence (SERVING_WORKERS_PUBLICATION=enabled), the
//   deploy credentials and the production publication policy admit the app;
// - never downgrades: the live build must be an ancestor of the new source;
// - uploads one version with no traffic and a strict binding check against serving;
// - stages it at 0% beside serving, smokes it through the version-override
//   header and compares every probe with serving, then restores serving alone;
// - moves traffic only while serving is still the captured version, waits for
//   the public build, and restores the captured version on any failure.
// The receipt keeps the serving version as the one-step rollback.
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { appConfig, SERVING_WORKERS } from './serving-workers-apps.mjs';

export { SERVING_WORKERS };

const SHA = /^[0-9a-f]{40}$/;
const SCHEDULES = 'serving-schedules.json';

/** Stop fence, credentials and source policy, checked before every mutation. */
export function admission(app, env, hold) {
  if (env.SERVING_WORKERS_PUBLICATION !== 'enabled')
    return 'stopped: SERVING_WORKERS_PUBLICATION is not enabled';
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID)
    return 'stopped: Cloudflare deploy credentials are not configured';
  if (hold) return `stopped: ${app} ${hold}`;
  return undefined;
}

/** Skip when live already serves the source; refuse anything but a fast-forward. */
export function sourceDecision(live, sha, isAncestor) {
  if (!SHA.test(live ?? ''))
    return { action: 'refuse', reason: 'live build identity unreadable' };
  if (live === sha)
    return { action: 'skip', reason: 'live already serves the source' };
  if (!isAncestor(live, sha))
    return {
      action: 'refuse',
      reason: `live ${live} is not an ancestor of ${sha}`,
    };
  return { action: 'publish' };
}

/** Same-origin script and stylesheet references a page's HTML loads. */
export function htmlAssets(html, limit = 4) {
  const found = [
    ...html.matchAll(/(?:src|href)="(\/[^"?#]+\.(?:js|css))"/g),
  ].map((m) => m[1]);
  return [...new Set(found)].slice(0, limit);
}

export function compareProbe(candidate, serving) {
  if (candidate.status >= 500) return `candidate ${candidate.status}`;
  if (candidate.status !== serving.status)
    return `status ${candidate.status} differs from serving ${serving.status}`;
  if ((candidate.location ?? '') !== (serving.location ?? ''))
    return `redirect ${candidate.location} differs from serving ${serving.location}`;
  return undefined;
}

export function buildCommit(body) {
  try {
    const info = JSON.parse(body);
    return info.commitHash ?? info.commit ?? null;
  } catch {
    return null;
  }
}

export function sameVersions(actual, expected) {
  const shape = (list) =>
    JSON.stringify(
      [...list]
        .map(({ version_id, percentage }) => [version_id, percentage])
        .sort()
    );
  return shape(actual) === shape(expected);
}

export async function withRetry(
  task,
  { attempts = 3, delayMs = 2000, sleep = wait, linear = false } = {}
) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      last = error;
      if (attempt < attempts)
        await sleep(linear ? delayMs : delayMs * 2 ** (attempt - 1));
    }
  }
  throw last;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createCloudflare(env, fetchImpl, sleep) {
  const base = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts`;
  const call = (route, init = {}) =>
    withRetry(
      async () => {
        const response = await fetchImpl(`${base}/${route}`, {
          ...init,
          signal: AbortSignal.timeout(30_000),
          headers: {
            authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
            'content-type': 'application/json',
          },
        });
        if (response.status === 429 || response.status >= 500)
          throw new Error(`Cloudflare ${response.status}`);
        const body = await response.json();
        if (!body.success)
          throw new Error(`Cloudflare ${route}: request rejected`);
        return body.result;
      },
      { sleep }
    );
  return {
    async deployment(worker) {
      const [active] = [
        ...(await call(`${worker}/deployments`)).deployments,
      ].sort((a, b) =>
        String(b.created_on).localeCompare(String(a.created_on))
      );
      return { id: active.id, versions: active.versions };
    },
    async schedules(worker) {
      const result = await call(`${worker}/schedules`);
      return (result.schedules ?? []).map(({ cron }) => cron).sort();
    },
    async deploy(worker, versions, message) {
      const result = await call(`${worker}/deployments`, {
        method: 'POST',
        body: JSON.stringify({
          strategy: 'percentage',
          versions,
          annotations: { 'workers/message': message },
        }),
      });
      return { id: result.id, versions: result.versions };
    },
  };
}

function probe(url, override, fetchImpl, sleep) {
  return withRetry(
    async () => {
      const headers = override
        ? { 'Cloudflare-Workers-Version-Overrides': override }
        : {};
      const response = await fetchImpl(url, {
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
      });
      return {
        status: response.status,
        location: response.headers.get('location'),
        body: await response.text(),
      };
    },
    { sleep }
  );
}

function run(command, args, options = {}) {
  const output = execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (output.trim()) console.log(output.trim());
  return output;
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/**
 * Restore and verify the sealed archive, then emit cf Build Output from its
 * own emitted config. Cron triggers stay configured on the Worker and versions
 * never change them, so they are recorded for the publish-time schedule check
 * and left out of the uploaded config.
 */
export function restore(app, sha, artifactDir, outDir, exec = run) {
  const config = appConfig(app);
  if (!SHA.test(sha ?? ''))
    throw new Error('Supply the exact 40-hex production SHA');
  const archive = path.join(artifactDir, config.archive);
  const appDir = path.resolve('apps', app);
  let emitted;
  if (config.restore === 'roadmap') {
    exec('tar', ['-xzf', archive, '-C', appDir]);
    const verifier = pathToFileURL(
      path.join(appDir, 'scripts/seal-artifact.mjs')
    );
    exec('node', [
      '--input-type=module',
      '-e',
      `import { verifySealedArtifact } from ${JSON.stringify(verifier.href)}; verifySealedArtifact(${JSON.stringify(`${appDir}/`)}, ${JSON.stringify(sha)});`,
    ]);
    emitted = readJson(
      path.join(appDir, 'roadmap-artifact.json')
    ).emittedConfig;
  } else {
    const { script, profile, env } = config.restore;
    const receipt = path.join(tmpdir(), `${app}-${sha}-restored.json`);
    const flags = profile ? ['--profile', 'production'] : [];
    const options = { env: { ...process.env, ...env(sha) } };
    exec(
      'python3',
      [
        script,
        ...flags,
        'restore',
        appDir,
        '--archive',
        archive,
        '--receipt',
        receipt,
      ],
      options
    );
    exec(
      'python3',
      [script, ...flags, 'verify', appDir, '--receipt', receipt],
      options
    );
    emitted = readJson(receipt).configPath;
  }
  if (typeof emitted !== 'string' || emitted.includes('..'))
    throw new Error('sealed receipt names no emitted config');
  let configPath = path.join(appDir, emitted);
  const emittedConfig = readJson(configPath);
  const crons = [...(emittedConfig.triggers?.crons ?? [])].sort();
  if (emittedConfig.triggers) {
    const { triggers: _triggers, ...versioned } = emittedConfig;
    configPath = path.join(path.dirname(configPath), 'serving-version.json');
    writeFileSync(configPath, `${JSON.stringify(versioned, null, 2)}\n`);
  }
  exec('node', [
    'scripts/ci/void-cf-output.mjs',
    '--config',
    configPath,
    '--out',
    outDir,
    '--sha',
    sha,
  ]);
  writeFileSync(path.join(outDir, SCHEDULES), `${JSON.stringify({ crons })}\n`);
}

/** Apps whose public build is not the production SHA yet. */
export async function plan(sha, { fetchImpl = fetch, sleep = wait } = {}) {
  const stale = [];
  for (const [app, { origins }] of Object.entries(SERVING_WORKERS)) {
    const info = await probe(
      `${origins[0]}/api/build-info`,
      null,
      fetchImpl,
      sleep
    ).catch(() => null);
    if (buildCommit(info?.body ?? '') !== sha) stale.push(app);
  }
  return stale;
}

export async function publish(
  app,
  sha,
  outDir,
  {
    env = process.env,
    hold,
    receiptPath,
    fetchImpl = fetch,
    exec = run,
    isAncestor,
    sleep = wait,
  } = {}
) {
  const config = appConfig(app);
  const receipt = {
    app,
    worker: config.worker,
    sourceSha: sha,
    outcome: 'started',
    steps: [],
  };
  const record = (step, detail = {}) => {
    receipt.steps.push({ step, at: new Date().toISOString(), ...detail });
    if (receiptPath)
      writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  };
  const fence = () => {
    const stopped = admission(app, env, hold);
    if (stopped) throw new Error(stopped);
  };
  const cf = createCloudflare(env, fetchImpl, sleep);
  const get = (url, override = null) => probe(url, override, fetchImpl, sleep);
  const publisher = (args) =>
    JSON.parse(
      exec('node', ['scripts/ci/void-cf-publisher.mjs', ...args], { env })
        .trim()
        .split('\n')
        .at(-1)
    );
  const [primary] = config.origins;
  let serving;
  const servingOnly = () => [{ version_id: serving, percentage: 100 }];
  /**
   * Put the captured version back alone, but only over a deployment this run
   * wrote (`ours`); anything else belongs to another writer and is left alone.
   */
  // The API has no compare-and-swap: a writer landing between the settled
  // read and the restore write can still be overwritten.
  const restoreServing = async (reason, ours) => {
    const current = await steadyRead();
    if (sameVersions(current.versions, servingOnly())) {
      record('restore-not-needed', { deployment: current.id, reason });
      return;
    }
    if (!sameVersions(current.versions, ours)) {
      record('restore-skipped', {
        reason: 'deployment changed by another writer',
        current: current.id,
      });
      return;
    }
    const restored = await cf.deploy(
      config.worker,
      servingOnly(),
      `${reason}; restore ${serving}`
    );
    await settle(servingOnly(), 'restored serving deployment');
    record('restored', { deployment: restored.id, reason });
  };
  /** Deployment reads lag writes: three identical reads 5 s apart. */
  const steadyRead = async () => {
    let last;
    let streak = 0;
    for (let attempt = 1; attempt <= 15; attempt += 1) {
      const current = await cf.deployment(config.worker);
      streak =
        last && sameVersions(current.versions, last.versions) ? streak + 1 : 1;
      last = current;
      if (streak >= 3) return current;
      await sleep(5000);
    }
    throw new Error('deployment did not settle');
  };
  /** Wait until `versions` reads back steadily. */
  const settle = async (versions, what) => {
    let streak = 0;
    for (let attempt = 1; attempt <= 15; attempt += 1) {
      const current = await cf.deployment(config.worker);
      streak = sameVersions(current.versions, versions) ? streak + 1 : 0;
      if (streak >= 3) return;
      await sleep(5000);
    }
    throw new Error(`${what} did not settle`);
  };
  try {
    if (!SHA.test(sha))
      throw new Error('Supply the exact 40-hex production SHA');
    fence();
    const before = await cf.deployment(config.worker);
    if (before.versions.length !== 1 || before.versions[0].percentage !== 100)
      throw new Error(
        'serving deployment is split; another rollout is in progress'
      );
    serving = before.versions[0].version_id;
    receipt.rollbackVersion = serving;
    const live = buildCommit((await get(`${primary}/api/build-info`)).body);
    const decision = sourceDecision(live, sha, isAncestor);
    record('source', { live, deployment: before.id, ...decision });
    if (decision.action === 'skip') {
      receipt.outcome = 'current';
      record('done');
      return receipt;
    }
    if (decision.action === 'refuse') throw new Error(decision.reason);
    const { crons } = readJson(path.join(outDir, SCHEDULES));
    if (crons.length) {
      const scheduled = await cf.schedules(config.worker);
      if (JSON.stringify(scheduled) !== JSON.stringify(crons))
        throw new Error(
          `live schedules ${scheduled} differ from the emitted ${crons}`
        );
    }

    fence();
    const upload = publisher([
      'publish',
      '--build',
      outDir,
      '--worker',
      config.worker,
      '--message',
      `${app} ${sha}`,
      '--strict',
    ]);
    const version = upload.versionId;
    receipt.version = version;
    record('upload', { version, previous: upload.previousVersionId });
    if (upload.previousVersionId !== serving)
      throw new Error(
        `serving moved to ${upload.previousVersionId} during upload`
      );

    fence();
    if ((await cf.deployment(config.worker)).id !== before.id)
      throw new Error('serving deployment changed before staging');
    const stage = [
      { version_id: serving, percentage: 100 },
      { version_id: version, percentage: 0 },
    ];
    let smokeError;
    try {
      const staged = await cf.deploy(
        config.worker,
        stage,
        `stage ${app} ${sha} at 0%`
      );
      record('stage', { deployment: staged.id });
      if (!sameVersions(staged.versions, stage))
        throw new Error('staged deployment does not match');
      const override = `${config.worker}="${version}"`;
      // The edge picks up a new deployment a few seconds after the write.
      await withRetry(
        async () => {
          const info = await get(`${primary}/api/build-info`, override);
          if (buildCommit(info.body) !== sha)
            throw new Error(`override does not reach ${version} yet`);
        },
        { attempts: 12, delayMs: 5000, sleep, linear: true }
      );
      const failures = [];
      for (const origin of config.origins) {
        const info = await get(`${origin}/api/build-info`, override);
        if (buildCommit(info.body) !== sha)
          failures.push(`${origin} build-info is not ${sha}`);
        for (const route of config.probes) {
          const candidate = await get(`${origin}${route}`, override);
          const difference = compareProbe(
            candidate,
            await get(`${origin}${route}`)
          );
          if (difference) failures.push(`${origin}${route}: ${difference}`);
          for (const asset of htmlAssets(candidate.body)) {
            const { status } = await get(
              `${new URL(origin).origin}${asset}`,
              override
            );
            if (status !== 200) failures.push(`${asset}: ${status}`);
          }
        }
      }
      record('smoke', { failures });
      if (failures.length)
        throw new Error(`smoke failed: ${failures.join('; ')}`);
    } catch (error) {
      smokeError = error;
    }
    try {
      await restoreServing(`unstage ${app} ${sha}`, stage);
    } catch (error) {
      record('restore-failed', { message: error.message });
      if (!smokeError) throw error;
    }
    if (smokeError) throw smokeError;
    await settle(servingOnly(), 'unstaged serving deployment');

    fence();
    try {
      const moved = publisher([
        'assign',
        '--worker',
        config.worker,
        '--version',
        version,
        '--expect-current',
        serving,
        '--build-info-url',
        `${primary}/api/build-info`,
        '--expect-build',
        sha,
      ]);
      record('assign', { served: moved.servedAfter });
    } catch (error) {
      await restoreServing(`rollback ${app} ${sha}`, [
        { version_id: version, percentage: 100 },
      ]).catch((rollback) =>
        record('restore-failed', { message: rollback.message })
      );
      throw error;
    }
    receipt.outcome = 'published';
    record('verified');
    return receipt;
  } catch (error) {
    receipt.outcome = 'failed';
    record('error', { message: error.message });
    throw error;
  }
}

function gitAncestor(ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'plan') {
    const only = args[1] && args[1] !== 'all' ? args[1] : undefined;
    const { productionPublicationHold } =
      await import('./production-publication-policy.ts');
    const stale = (await plan(args[0])).filter(
      (app) =>
        (!only || app === only) &&
        !productionPublicationHold(`${app}-cloudflare.yaml`)
    );
    console.log(`stale: ${stale.join(', ') || 'none'}`);
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `apps=${JSON.stringify(stale)}\n`
      );
  } else if (mode === 'restore') {
    const [app, sha, artifactDir, outDir] = args;
    restore(app, sha, artifactDir, outDir);
  } else if (mode === 'publish') {
    const [app, sha, outDir] = args;
    if (!existsSync(outDir ?? ''))
      throw new Error('publish needs the restored cf Build Output');
    const { productionPublicationHold } =
      await import('./production-publication-policy.ts');
    const result = await publish(app, sha, outDir, {
      hold: productionPublicationHold(`${app}-cloudflare.yaml`),
      receiptPath: path.join(
        process.env.RUNNER_TEMP ?? tmpdir(),
        `${app}-serving-publication.json`
      ),
      isAncestor: gitAncestor,
    });
    console.log(
      `${app}: ${result.outcome}${result.version ? ` ${result.version}` : ''}; rollback ${result.rollbackVersion}`
    );
  } else {
    throw new Error('Usage: serving-workers.mjs <plan|restore|publish> ...');
  }
}
