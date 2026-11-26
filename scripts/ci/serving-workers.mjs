// Serving-worker publisher:
//   node scripts/ci/serving-workers.mjs plan <sha>
//   node scripts/ci/serving-workers.mjs restore <app> <sha> <artifact-dir> <cf-output-dir>
//   node scripts/ci/serving-workers.mjs publish <app> <sha> <cf-output-dir>
//     env: SERVING_MODE=publish|rehearse, SERVING_SUPERSEDE=<live sha>,
//          ARTIFACT_NAME, ARTIFACT_SHA256 (recorded in the receipt)
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
// Rehearse mode stops after the 0% smoke and unstage: no traffic moves.
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { appConfig, SERVING_WORKERS } from './serving-workers-apps.mjs';
import { restore, run, SCHEDULES } from './serving-workers-restore.mjs';

export { restore, SERVING_WORKERS };

const SHA = /^[0-9a-f]{40}$/;

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
export function sourceDecision(live, sha, isAncestor, supersede = '') {
  if (!SHA.test(live ?? ''))
    return { action: 'refuse', reason: 'live build identity unreadable' };
  if (live === sha)
    return { action: 'skip', reason: 'live already serves the source' };
  if (!isAncestor(live, sha)) {
    // An ACKed catch-up names the exact off-branch build it replaces; a live
    // build that already contains the source is never replaced.
    if (supersede && supersede === live && !isAncestor(sha, live))
      return { action: 'publish', superseded: live };
    return {
      action: 'refuse',
      reason: `live ${live} is not an ancestor of ${sha}`,
    };
  }
  return { action: 'publish' };
}

/**
 * A candidate's build-info must name a production build: a build without the
 * PLATFORM_BUILD_* environment reports environment/refName "local".
 */
export function buildIdentityProblem(body) {
  let info;
  try {
    info = JSON.parse(body);
  } catch {
    return 'build-info is not JSON';
  }
  if (info.environment !== undefined && info.environment !== 'production')
    return `build-info environment is ${info.environment}, not production`;
  if (
    info.refName !== undefined &&
    !['production', 'main'].includes(info.refName)
  )
    return `build-info refName is ${info.refName}`;
  return undefined;
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
  const deployment = async (worker) => {
    const [active] = [
      ...(await call(`${worker}/deployments`)).deployments,
    ].sort((a, b) => String(b.created_on).localeCompare(String(a.created_on)));
    return { id: active.id, versions: active.versions };
  };
  return {
    deployment,
    /** Newest uploaded version: /settings and /secrets writes follow it. */
    async latestVersion(worker) {
      const result = await call(`${worker}/versions`);
      return (result.items ?? result)[0]?.id ?? null;
    },
    async versionMessage(worker, version) {
      const result = await call(`${worker}/versions/${version}`);
      return result.annotations?.['workers/message'] ?? null;
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
      // The write answers with the new deployment's id alone, so the versions
      // it serves are read back from the active deployment, which has to be
      // the one just written. The listing can lag a write, so the read is
      // retried over about a minute, like the settle that follows a write.
      return withRetry(
        async () => {
          const active = await deployment(worker);
          if (active.id !== result.id)
            throw new Error(
              `the written deployment ${result.id} is not the active one (${active.id})`
            );
          return active;
        },
        { attempts: 6, sleep }
      );
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

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

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
    mode = 'publish',
    supersede = '',
    artifact = {},
    run: runIdentity = {},
  } = {}
) {
  const config = appConfig(app);
  if (!['publish', 'rehearse'].includes(mode))
    throw new Error(`Unknown publication mode: ${mode}`);
  const receipt = {
    schema: 2,
    app,
    worker: config.worker,
    sourceSha: sha,
    mode,
    run: runIdentity,
    artifact,
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
    // Preimage: what serves before this run touches anything. The version
    // reads are evidence only, so an unreadable one is recorded as null.
    const optional = (read) => read().catch(() => null);
    receipt.preimage = {
      deploymentId: before.id,
      servingVersion: serving,
      servingMessage: await optional(() =>
        cf.versionMessage(config.worker, serving)
      ),
      latestVersion: await optional(() => cf.latestVersion(config.worker)),
      liveBuild: live,
      capturedAt: new Date().toISOString(),
    };
    const decision = sourceDecision(live, sha, isAncestor, supersede);
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
          receipt.buildIdentity = info.body;
        },
        { attempts: 12, delayMs: 5000, sleep, linear: true }
      );
      const failures = [];
      const identity = buildIdentityProblem(receipt.buildIdentity);
      if (identity) failures.push(identity);
      try {
        receipt.buildIdentity = JSON.parse(receipt.buildIdentity);
      } catch {}
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
    // The uploaded version stays the newest one: a /settings or /secrets
    // write now would build on it rather than on serving.
    receipt.latestIsNotServing = true;
    if (mode === 'rehearse') {
      receipt.outcome = 'rehearsed';
      record('done');
      return receipt;
    }

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
    receipt.latestIsNotServing = false;
    record('verified');
    return receipt;
  } catch (error) {
    receipt.outcome = 'failed';
    if (receipt.version) receipt.latestIsNotServing = true;
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
    // One matrix leg per app: every leg waits for every build, so all of them
    // reach the release environment together and one approval admits the round.
    const matrix = stale.map((app) => ({
      app,
      artifact: SERVING_WORKERS[app].artifact(args[0]),
    }));
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `apps=${JSON.stringify(stale)}\nmatrix=${JSON.stringify(matrix)}\n`
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
      // RUNNER_TEMP is per-job; elsewhere use a private directory, never a
      // predictable path in the shared temp dir.
      receiptPath: path.join(
        process.env.RUNNER_TEMP ||
          mkdtempSync(path.join(tmpdir(), 'serving-workers-')),
        `${app}-serving-publication.json`
      ),
      isAncestor: gitAncestor,
      mode: process.env.SERVING_MODE || 'publish',
      supersede: process.env.SERVING_SUPERSEDE || '',
      artifact: {
        name: process.env.ARTIFACT_NAME || null,
        sha256: process.env.ARTIFACT_SHA256 || null,
      },
      run: {
        id: process.env.GITHUB_RUN_ID || null,
        attempt: process.env.GITHUB_RUN_ATTEMPT || null,
        event: process.env.GITHUB_EVENT_NAME || null,
      },
    });
    console.log(
      `${app}: ${result.outcome}${result.version ? ` ${result.version}` : ''}; rollback ${result.rollbackVersion}`
    );
  } else {
    throw new Error('Usage: serving-workers.mjs <plan|restore|publish> ...');
  }
}
