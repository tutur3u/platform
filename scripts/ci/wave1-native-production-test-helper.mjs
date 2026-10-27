import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { productionPublicationPolicy } from '../../tuturuuu.ci.ts';
import { artifactDigest, prepare } from './wave1-native-artifact.mjs';
import { assertRouteFree, main } from './wave1-native-production.mjs';

const require = createRequire(import.meta.url);
const { fixture } = require('./wave1-native-test-fixture.cjs');
export const sha = 'a'.repeat(40);
export const oldId = '11111111-1111-1111-1111-111111111111';
export const newId = '22222222-2222-2222-2222-222222222222';
const publicInputs = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://production-fixture.example.com',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ['sb', 'publishable', 'fixture'].join(
    '_'
  ),
};

export function setup(t, { admitted = true } = {}) {
  const previous = productionPublicationPolicy.calendar;
  if (admitted)
    productionPublicationPolicy.calendar = {
      state: 'admitted',
      reason: 'fixture',
      surfaces: ['frontend'],
    };
  else
    productionPublicationPolicy.calendar = {
      state: 'held',
      reason: 'fixture hold',
    };
  t.after(() => {
    productionPublicationPolicy.calendar = previous;
  });
  for (const [key, value] of Object.entries(publicInputs)) {
    const prior = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (prior === undefined) delete process.env[key];
      else process.env[key] = prior;
    });
  }
  const appRoot = fixture(t, 'calendar');
  const receipt = prepare(appRoot, 'calendar', 'production', 'fixture', sha);
  const digest = artifactDigest(receipt);
  const state = {
    writes: 0,
    active: oldId,
    ids: [],
    prior: false,
    attached: false,
    duringUpload: false,
    priorMode: 'started',
    attachedRoute: false,
    scriptlessAcme: false,
    publicServing: null,
    calls: [],
  };
  const env = {
    ...publicInputs,
    GITHUB_REF: 'refs/heads/production',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    PUBLICATION_ENVIRONMENT: 'wave1-calendar-production',
    GITHUB_SHA: sha,
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_RUN_ID: '123',
    GITHUB_REPOSITORY: 'fixture/repo',
    GITHUB_TOKEN: ['github', 'fixture'].join('-'),
    WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN: ['production', 'fixture'].join('-'),
    WAVE1_PRODUCTION_CLOUDFLARE_READ_TOKEN: ['topology', 'fixture'].join('-'),
    RUNNER_TEMP: appRoot,
  };
  const version = (id) => ({
    id,
    annotations:
      state.versionAnnotations ??
      (id === newId ? { 'workers/message': sha, 'workers/tag': digest } : {}),
  });
  const fetcher = async (url, options) => {
    state.calls.push(url);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    assert.equal(options.method, 'GET');
    if (url.startsWith('https://api.github.com/')) {
      assert.equal(options.headers.Authorization, 'Bearer github-fixture');
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
          name: 'publish-calendar',
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
          name: 'publish-calendar',
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
      const run = { id: 123, head_sha: sha, head_branch: 'production' };
      return Response.json({
        total_count: state.prior ? 2 : 1,
        workflow_runs: state.prior
          ? [run, { ...run, id: 122, head_sha: 'b'.repeat(40) }]
          : [run],
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
      result = state.attached ? [{ service: receipt.profile.name }] : [];
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
                      pattern:
                        'calendar.tuturuuu.com/.well-known/acme-challenge/*',
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
    else if (url.endsWith('/secrets'))
      result = receipt.profile.secrets.map((name) => ({ name }));
    else if (url.endsWith('/deployments'))
      result = {
        deployments: [
          {
            id: 'deployment',
            versions: [{ version_id: state.active, percentage: 100 }],
          },
          ...(state.noRollbackHistory
            ? []
            : [
                {
                  id: 'older-deployment',
                  versions: [{ version_id: oldId, percentage: 100 }],
                },
              ]),
        ],
      };
    else if (url.endsWith('/versions?per_page=100'))
      result = { items: state.ids.map((id) => ({ id })) };
    else if (/\/versions\/[a-f0-9-]+$/.test(url))
      result = version(url.split('/').at(-1));
    else throw new Error('Unexpected request');
    return Response.json({ success: true, result });
  };
  const exec = (command, args, options) => {
    state.writes++;
    assert.equal(command, 'bun');
    assert.equal(args.includes('deploy'), true);
    const config = JSON.parse(
      readFileSync(args[args.indexOf('--config') + 1], 'utf8')
    );
    assertRouteFree(config);
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
    state.active = newId;
    state.ids = [newId];
    writeFileSync(
      options.env.WRANGLER_OUTPUT_FILE_PATH,
      `${JSON.stringify({
        type: 'deploy',
        worker_name: receipt.profile.name,
        version_id: newId,
      })}\n`
    );
  };
  return {
    state,
    env,
    appRoot,
    run: (options = {}) =>
      main({
        argv: ['calendar', sha, 'all'],
        env,
        fetcher,
        exec,
        appRoot,
        ...options,
      }),
  };
}
