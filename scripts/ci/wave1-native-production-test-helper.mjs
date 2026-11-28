import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  truncateSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  productionAppExclusions,
  productionPublicationPolicy,
} from '../../tuturuuu.ci.ts';
import { artifactDigest, prepare } from './wave1-native-artifact.mjs';
import { assertRouteFree, main } from './wave1-native-production.mjs';
import { observabilityFor } from './wave1-native-profile.mjs';

const require = createRequire(import.meta.url);

// The manifest the wave-1 emit wrote under this test's runner scratch.
function emittedManifestIn(runnerTemp) {
  const found = readdirSync(runnerTemp)
    .filter((name) => name.startsWith('wave1-cf-publish-'))
    .map((name) =>
      join(
        runnerTemp,
        name,
        'prebuilt/.cloudflare/output/v0/workers/default/worker.config.json'
      )
    )
    .filter((path) => existsSync(path))
    // The preflight measurement emits too; the upload's emit is the newest.
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  assert.ok(found.length > 0, 'the upload emitted a worker config');
  return JSON.parse(readFileSync(found[0], 'utf8')).manifest;
}
const { fixture } = require('./wave1-native-test-fixture.cjs');
export const sha = 'a'.repeat(40);
export const oldId = '11111111-1111-1111-1111-111111111111';
export const newId = 'b2222222-2222-2222-2222-222222222222';
const publicInputs = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://production-fixture.example.com',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ['sb', 'publishable', 'fixture'].join(
    '_'
  ),
};

export function setup(
  t,
  { app = 'calendar', admitted = true, oversized = false } = {}
) {
  const previous = productionPublicationPolicy[app];
  const previousExclusion = productionAppExclusions[app];
  delete productionAppExclusions[app];
  if (admitted)
    productionPublicationPolicy[app] = {
      state: 'admitted',
      reason: 'fixture',
      surfaces: ['frontend'],
    };
  else
    productionPublicationPolicy[app] = {
      state: 'held',
      reason: 'fixture hold',
    };
  t.after(() => {
    productionPublicationPolicy[app] = previous;
    if (previousExclusion !== undefined)
      productionAppExclusions[app] = previousExclusion;
  });
  for (const [key, value] of Object.entries(publicInputs)) {
    const prior = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (prior === undefined) delete process.env[key];
      else process.env[key] = prior;
    });
  }
  const appRoot = fixture(t, app);
  const runnerTemp = realpathSync(mkdtempSync(join(tmpdir(), 'wave1-runner-')));
  t.after(() => rmSync(runnerTemp, { recursive: true, force: true }));
  if (oversized)
    truncateSync(join(appRoot, 'dist/server/index.js'), 64 * 1024 ** 2 + 1);
  const receipt = prepare(appRoot, app, 'production', 'fixture', sha);
  const digest = artifactDigest(receipt);
  const state = {
    writes: 0,
    active: oldId,
    ids: [oldId],
    prior: false,
    attached: false,
    attachedHostname: undefined,
    // null keeps the fixture route-free whatever tuturuuu.ci.ts records.
    servingTopology: null,
    duringUpload: false,
    priorMode: 'started',
    attachedRoute: false,
    scriptlessAcme: false,
    publicServing: null,
    calls: [],
    // Source SHA annotated on the serving version, and GitHub's compare
    // status of that live SHA against the candidate.
    liveSha: 'e'.repeat(40),
    // The active deployment split; null derives one from `active`.
    split: null,
    deploymentWrites: [],
    // The uploaded module listing: names from the emitted manifest, passed
    // through moduleNames; moduleResponse replaces the whole response.
    moduleNames: (names) => names,
    moduleResponse: null,
    moduleReads: 0,
    failDeploymentWrite: () => false,
    // Public edge behaviour: status codes per serving version, and whether
    // the override header reaches a staged version.
    publicStatus: {},
    // Behaviour once a version serves publicly, without the override.
    unstagedStatus: {},
    unstagedCommit: undefined,
    overrideReaches: true,
    stagedCommit: undefined,
    publicCalls: [],
    compareStatus: 'behind',
    compares: [],
    settingsReads: 0,
    settingsLagReads: 0,
    settingsErrorReads: 0,
    settingsWaitMs: 0,
    scriptSettings: {
      observability: {
        enabled: true,
        // Live settings already match the app's profile sampling.
        head_sampling_rate: observabilityFor(app).head_sampling_rate,
      },
    },
  };
  const env = {
    ...publicInputs,
    GITHUB_REF: 'refs/heads/production',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    PUBLICATION_ENVIRONMENT: `wave1-${app}-production`,
    GITHUB_SHA: sha,
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_RUN_ID: '123',
    GITHUB_REPOSITORY: 'fixture/repo',
    GITHUB_TOKEN: ['github', 'fixture'].join('-'),
    WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN: ['production', 'fixture'].join('-'),
    WAVE1_PRODUCTION_CLOUDFLARE_READ_TOKEN: ['topology', 'fixture'].join('-'),
    RUNNER_TEMP: runnerTemp,
  };
  const version = (id) => ({
    id: state.uppercaseVersionDetail ? id.toUpperCase() : id,
    annotations:
      state.versionAnnotationsById?.[id] ??
      state.versionAnnotations ??
      (id === newId
        ? { 'workers/message': sha, 'workers/tag': digest }
        : state.liveSha
          ? { 'workers/message': state.liveSha }
          : {}),
  });
  const fetcher = async (url, options) => {
    state.calls.push(url);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    const deploymentWrite =
      options.method === 'POST' && url.endsWith('/deployments');
    assert.equal(options.method, deploymentWrite ? 'POST' : 'GET');
    if (deploymentWrite) {
      assert.equal(
        options.headers.Authorization,
        'Bearer production-fixture',
        'Only the upload credential writes deployments'
      );
      const { strategy, versions } = JSON.parse(options.body);
      assert.equal(strategy, 'percentage');
      state.deploymentWrites.push(versions);
      if (state.failDeploymentWrite(versions, state.deploymentWrites.length))
        return new Response('{"success":false}', { status: 500 });
      state.split = versions;
      const full = versions.find(({ percentage }) => percentage === 100);
      if (full) state.active = full.version_id;
      return Response.json({ success: true, result: { id: 'written' } });
    }
    if (url.startsWith('https://api.github.com/')) {
      assert.equal(options.headers.Authorization, 'Bearer github-fixture');
      if (url.includes('/compare/')) {
        state.compares.push(url);
        return Response.json({ status: state.compareStatus });
      }
      if (url.includes('/artifacts?'))
        return Response.json({ total_count: 0, artifacts: [] });
      if (url.includes('/jobs?')) {
        const step = {
          name: 'Upload once without attaching serving topology',
          status: 'completed',
          conclusion: 'failure',
          started_at: '2026-10-27T00:00:00Z',
        };
        const priorJob = {
          name: `publish-${app}`,
          run_id: url.includes('/runs/122/') ? 122 : 123,
          run_attempt: 1,
          status: 'completed',
          conclusion: 'failure',
          steps: [step],
        };
        if (state.priorMode === 'before')
          priorJob.steps = [
            { ...step, conclusion: 'skipped', started_at: null },
          ];
        if (state.priorMode === 'unknown') priorJob.steps = [];
        const currentJob = {
          name: `publish-${app}`,
          run_id: 123,
          run_attempt: Number(env.GITHUB_RUN_ATTEMPT),
          status: 'in_progress',
          conclusion: null,
          steps: [{ ...step, status: 'in_progress' }],
        };
        const jobs = url.includes('/runs/123/')
          ? [currentJob, ...(env.GITHUB_RUN_ATTEMPT === '1' ? [] : [priorJob])]
          : [priorJob];
        return Response.json({ total_count: jobs.length, jobs });
      }
      assert.equal(
        url.includes('head_sha='),
        false,
        'Replay fence must span all source SHAs'
      );
      const run = {
        id: 123,
        head_sha: sha,
        head_branch: 'production',
        run_attempt: 1,
      };
      return Response.json({
        total_count: state.prior ? 2 : 1,
        workflow_runs: state.prior
          ? [run, { ...run, id: 122, head_sha: 'b'.repeat(40) }]
          : [run],
      });
    }
    if (url.includes('/workers/workers/') && url.endsWith('?include=modules')) {
      assert.equal(options.headers.Authorization, 'Bearer production-fixture');
      state.moduleReads++;
      state.writesBeforeModuleRead = state.deploymentWrites.length;
      // The uploaded version's modules: the emitted manifest's, unless a
      // test reshapes the listing.
      const manifest = emittedManifestIn(runnerTemp);
      const names = state.moduleNames(Object.keys(manifest.modules));
      if (state.moduleResponse) return state.moduleResponse(names, manifest);
      return Response.json({
        success: true,
        result: {
          id: newId,
          main_module: manifest.mainModule,
          modules: names.map((name) => ({
            name,
            content_type: 'application/javascript+module',
            content_base64: Buffer.from(`// ${name}`).toString('base64'),
          })),
        },
      });
    }
    const topology =
      ['/domains', '/routes', '/subdomain'].some((suffix) =>
        url.endsWith(suffix)
      ) || url.includes('/zones?');
    if (topology)
      assert.equal(options.headers.Authorization, 'Bearer topology-fixture');
    else
      assert.ok(
        ['Bearer topology-fixture', 'Bearer production-fixture'].includes(
          options.headers.Authorization
        )
      );
    let result;
    if (url.includes('/zones?'))
      return Response.json({
        success: true,
        result_info: { total_count: 2 },
        result: ['1'.repeat(32), '2'.repeat(32)].map((id) => ({
          id,
          account: { id: receipt.profile.accountId },
        })),
      });
    if (url.endsWith('/domains'))
      result = state.attached
        ? [
            {
              service: receipt.profile.name,
              ...(state.attachedHostname
                ? { hostname: state.attachedHostname }
                : {}),
            },
          ]
        : [];
    else if (url.endsWith('/routes'))
      result =
        state.attachedRoute && url.includes('2'.repeat(32))
          ? [
              {
                id: 'route',
                pattern: 'other.example/*',
                script: receipt.profile.name,
              },
            ]
          : [
              { id: 'unrelated', script: 'another-worker' },
              ...(state.scriptlessAcme
                ? [
                    {
                      id: 'acme',
                      pattern: `${receipt.profile.host}/.well-known/acme-challenge/*`,
                      script: null,
                    },
                  ]
                : []),
            ];
    else if (url.endsWith('/subdomain'))
      result = {
        enabled: state.publicServing === 'workers.dev',
        previews_enabled: state.publicServing === 'preview',
      };
    else if (url.endsWith('/script-settings')) {
      assert.ok(url.endsWith(`/${receipt.profile.name}/script-settings`));
      assert.equal(options.headers.Authorization, 'Bearer topology-fixture');
      assert.equal(state.active, newId, 'Settings read follows deployment');
      state.settingsReads++;
      if (state.settingsReads <= state.settingsErrorReads)
        return new Response('{"success":false}', { status: 503 });
      result =
        state.settingsReads <= state.settingsLagReads
          ? { observability: null }
          : state.scriptSettings;
    } else if (url.endsWith('/secrets'))
      result = receipt.profile.secrets.map((name) => ({ name }));
    else if (url.endsWith('/deployments') || url.includes('/deployments?'))
      result = {
        deployments: url.includes("&page=") ? [] : state.deployments ?? [
          {
            id: state.deploymentId ?? 'a0000000-0000-0000-0000-000000000001',
            versions: state.split ?? [
              { version_id: state.active, percentage: 100 },
            ],
          },
          ...(state.noRollbackHistory
            ? []
            : [
                {
                  id: 'a0000000-0000-0000-0000-000000000002',
                  versions: [{ version_id: oldId, percentage: 100 }],
                },
              ]),
        ],
      };
    else if (url.includes('/versions?per_page=100')) {
      if (state.versionsResponse) return state.versionsResponse(url);
      const splitIds = (state.split ?? []).map((entry) => entry.version_id);
      const allIds = [
        ...new Set(
          [oldId, state.active, ...splitIds, ...state.ids].filter(Boolean)
        ),
      ];
      const page = Number(/[?&]page=(\d+)/u.exec(url)?.[1] ?? 1);
      const items = page === 1 ? allIds.map((id) => ({ id })) : [];
      return Response.json({
        success: true,
        result: { items },
        result_info: {
          page,
          per_page: 100,
          count: items.length,
          total_count: allIds.length,
          total_pages: allIds.length ? 1 : 0,
        },
      });
    } else if (/\/versions\/[a-f0-9-]+$/.test(url))
      result = version(url.split('/').at(-1));
    else throw new Error('Unexpected request');
    return Response.json({ success: true, result });
  };
  // The public edge: the 100% version answers unless the override header
  // names a staged version in the current split.
  const healthFetcher = async (url, options) => {
    state.publicCalls.push({ url, options });
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.cookie, undefined);
    assert.equal(options.headers.Authorization, undefined);
    const split = state.split ?? [
      { version_id: state.active, percentage: 100 },
    ];
    const override = options.headers['Cloudflare-Workers-Version-Overrides'];
    const staged = split.find(
      ({ version_id }) => override === `${receipt.profile.name}="${version_id}"`
    );
    const viaOverride = Boolean(staged && state.overrideReaches);
    const serving = viaOverride
      ? staged.version_id
      : split.find(({ percentage }) => percentage === 100).version_id;
    const behaviour = viaOverride
      ? state.publicStatus[serving]
      : (state.unstagedStatus[serving] ?? state.publicStatus[serving]);
    if (behaviour === 'timeout') {
      const error = new Error('timed out');
      error.name = 'TimeoutError';
      throw error;
    }
    if (typeof behaviour === 'number')
      return new Response('error', { status: behaviour });
    const { pathname } = new URL(url);
    if (pathname.endsWith('/api/build-info'))
      return Response.json({
        appName: state.buildInfoApp ?? app,
        commitHash:
          serving !== newId
            ? state.liveSha
            : viaOverride
              ? (state.stagedCommit ?? sha)
              : (state.unstagedCommit ?? sha),
      });
    return new Response(null, {
      status: 307,
      headers: { location: 'https://tuturuuu.com/login' },
    });
  };
  const exec = (command, args, options) => {
    assert.ok(command.endsWith('/bin/cf'), command);
    const versionOnly = args[0] === 'workers';
    assert.deepEqual(
      args.slice(0, versionOnly ? 4 : 2),
      versionOnly
        ? ['workers', 'versions', 'create', '--prebuilt']
        : ['deploy', '--prebuilt']
    );
    // Production uploads a version without traffic; only the measurement
    // runs the dry deploy.
    assert.equal(versionOnly, !args.includes('--dry-run'));
    assert.equal(options.cwd, appRoot);
    assert.equal(options.env.GITHUB_TOKEN, undefined);
    assertRouteFree(
      JSON.parse(
        readFileSync(join(appRoot, 'dist/wave1/wrangler.json'), 'utf8')
      )
    );
    if (args.includes('--dry-run')) {
      assert.equal(options.env.CLOUDFLARE_API_TOKEN, undefined);
      assert.equal(options.timeout, 120000);
      return;
    }
    state.writes++;
    assert.equal(
      options.env.CLOUDFLARE_API_TOKEN,
      env.WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN
    );
    assert.equal(
      args.some((arg) => arg.includes(['production', 'fixture'].join('-'))),
      false
    );
    assert.equal(options.timeout, 180000);
    assert.equal(options.cwd, appRoot);
    for (const name of [
      'GITHUB_TOKEN',
      'WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN',
      'WAVE1_PRODUCTION_CLOUDFLARE_READ_TOKEN',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'NODE_OPTIONS',
    ])
      assert.equal(options.env[name], undefined);
    if (state.uncertain)
      throw state.uploadError ?? new Error('Lost upload response');
    if (state.duringUpload) state.attached = true;
    state.ids = [newId];
    return JSON.stringify({ version_id: newId });
  };
  return {
    state,
    env,
    appRoot,
    exec,
    run: (options = {}) =>
      main({
        argv: [app, sha, 'all'],
        env,
        fetcher,
        exec,
        appRoot,
        servingTopology: state.servingTopology,
        healthFetcher,
        healthSleep: async () => {},
        healthOptions: { rounds: 2, propagationRounds: 2 },
        smokeOptions: { reachAttempts: 2, reachDelayMs: 0 },
        settingsTiming: {
          now: () => state.settingsWaitMs,
          sleep: (ms) => {
            assert.equal(ms, 5_000);
            state.settingsWaitMs += ms;
          },
        },
        ...options,
      }),
  };
}
