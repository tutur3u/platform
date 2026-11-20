import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  deleteTasksVersion,
  inheritanceSource,
  keptVars,
  rehearseTasksOutput,
  TASKS_WORKER,
  uploadTasksVersion,
} from './tasks-cf-upload.mjs';

const V1 = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';
const SHA = 'a'.repeat(40);

const latestBindings = () => [
  { name: 'ASSETS', type: 'assets' },
  { name: 'NEXT_PUBLIC_SUPABASE_URL', type: 'plain_text', text: 'https://db' },
  { name: 'NODE_ENV', type: 'plain_text', text: 'staging' },
  { name: 'SUPABASE_SECRET_KEY', type: 'secret_text' },
];

function tasksArtifact() {
  const root = mkdtempSync(join(tmpdir(), 'tasks-cf-upload-'));
  const server = join(root, 'dist/server');
  mkdirSync(server, { recursive: true });
  mkdirSync(join(root, 'dist/client'), { recursive: true });
  writeFileSync(join(server, 'index.mjs'), 'export default {};\n');
  writeFileSync(join(server, 'chunk.mjs'), 'export const x = 1;\n');
  writeFileSync(join(root, 'dist/client/offline.html'), '<p>offline</p>\n');
  const config = {
    name: TASKS_WORKER,
    topLevelName: TASKS_WORKER,
    main: 'index.mjs',
    no_bundle: true,
    rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
    compatibility_date: '2026-10-19',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    workers_dev: false,
    preview_urls: false,
    upload_source_maps: false,
    assets: {
      directory: '../client',
      binding: 'ASSETS',
      run_worker_first: true,
      not_found_handling: 'none',
      html_handling: 'none',
    },
    vars: { NODE_ENV: 'production', TUTURUUU_NOINDEX: '0' },
    services: [],
    durable_objects: { bindings: [] },
    migrations: [],
  };
  const configPath = join(server, 'deploy.json');
  writeFileSync(configPath, JSON.stringify(config));
  return { root, configPath };
}

/** A cf fake whose uploaded version carries exactly the Build Output env. */
function fakeCf({ serving = V1, live = latestBindings() } = {}) {
  const calls = [];
  let uploaded;
  const toWire = ([name, binding]) => {
    if (binding.type === 'text')
      return { name, type: 'plain_text', text: binding.value };
    if (binding.type === 'json')
      return { name, type: 'json', json: binding.value };
    return { name, type: binding.type };
  };
  const exec = (_bin, args, options) => {
    const cli = args.join(' ');
    calls.push(cli);
    if (cli.startsWith('workers deployments list'))
      return JSON.stringify({
        deployments: [{ versions: [{ version_id: serving, percentage: 100 }] }],
      });
    if (cli.startsWith(`workers versions get ${V1}`))
      return JSON.stringify({ bindings: live });
    if (cli.startsWith('workers versions create')) {
      const workerConfig = JSON.parse(
        readFileSync(
          join(
            options.cwd,
            '.cloudflare/output/v0/workers/default/worker.config.json'
          ),
          'utf8'
        )
      );
      uploaded = {
        compatibility_date: workerConfig.compatibilityDate,
        compatibility_flags: workerConfig.compatibilityFlags,
        main_module: workerConfig.manifest.mainModule,
        bindings: [
          ...Object.entries(workerConfig.env).map(toWire),
          ...live.filter((binding) => binding.type === 'secret_text'),
        ],
      };
      return `Worker Version ID: ${V2}\n`;
    }
    if (cli.startsWith(`workers versions get ${V2}`))
      return JSON.stringify(uploaded);
    throw new Error(`unexpected cf ${cli}`);
  };
  return { calls, exec, uploaded: () => uploaded };
}

test('keeps latest-version vars the config does not set; config values win', () => {
  assert.deepEqual(keptVars({ NODE_ENV: 'production' }, latestBindings()), {
    NEXT_PUBLIC_SUPABASE_URL: 'https://db',
  });
  assert.throws(
    () => keptVars({}, [{ name: 'FEATURES', type: 'json', json: 'on' }]),
    /FEATURES: JSON variables are not carried forward/
  );
  assert.throws(() => keptVars({}, undefined), /latest version bindings/);
});

test('uploads the sealed artifact through cf without moving traffic', async () => {
  const { root, configPath } = tasksArtifact();
  try {
    const deps = fakeCf();
    const uploads = [];
    const version = await uploadTasksVersion(
      {
        configPath,
        destination: join(root, 'cf-output'),
        servingVersion: V1,
        latestBindings: latestBindings(),
        sourceSha: SHA,
        env: { CF_BIN: 'cf-fixture' },
      },
      { exec: deps.exec, sleep: () => {}, onUploaded: (id) => uploads.push(id) }
    );
    assert.equal(version, V2);
    assert.deepEqual(uploads, [V2]);
    const create = deps.calls.find((call) =>
      call.startsWith('workers versions create')
    );
    assert.match(create, /--prebuilt --mode production --message a{40}/u);
    assert.ok(
      !deps.calls.some((call) => call.startsWith('workers deployments create'))
    );
    const bindings = Object.fromEntries(
      deps.uploaded().bindings.map((binding) => [binding.name, binding])
    );
    assert.equal(bindings.NODE_ENV.text, 'production');
    assert.equal(bindings.TUTURUUU_NOINDEX.text, '0');
    assert.equal(bindings.NEXT_PUBLIC_SUPABASE_URL.text, 'https://db');
    assert.equal(bindings.SUPABASE_SECRET_KEY.type, 'secret_text');
    const workerConfig = JSON.parse(
      readFileSync(
        join(
          root,
          'cf-output/.cloudflare/output/v0/workers/default/worker.config.json'
        ),
        'utf8'
      )
    );
    assert.equal(workerConfig.assets.htmlHandling, 'none');
    assert.equal(workerConfig.previewUrls, false);
    assert.equal(workerConfig.exports, undefined);
    assert.deepEqual(Object.keys(workerConfig.manifest.modules).sort(), [
      'chunk.mjs',
      'index.mjs',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('refuses when the serving version moved during the upload', async () => {
  const { root, configPath } = tasksArtifact();
  try {
    const deps = fakeCf();
    await assert.rejects(
      uploadTasksVersion(
        {
          configPath,
          destination: join(root, 'cf-output'),
          servingVersion: '33333333-3333-4333-8333-333333333333',
          latestBindings: latestBindings(),
          sourceSha: SHA,
          env: { CF_BIN: 'cf-fixture' },
        },
        { exec: deps.exec, sleep: () => {} }
      ),
      /serving version moved/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('refuses a sealed config naming another Worker', async () => {
  const { root, configPath } = tasksArtifact();
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    writeFileSync(configPath, JSON.stringify({ ...config, name: 'other' }));
    await assert.rejects(
      uploadTasksVersion({
        configPath,
        destination: join(root, 'cf-output'),
        servingVersion: V1,
        latestBindings: latestBindings(),
        sourceSha: SHA,
        env: { CF_BIN: 'cf-fixture' },
      }),
      /names another Worker/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rehearsal dry-runs the converted output without credentials', async () => {
  const { root, configPath } = tasksArtifact();
  try {
    const runs = [];
    const summary = await rehearseTasksOutput(
      {
        configPath,
        destination: join(root, 'cf-output'),
        sourceSha: SHA,
        env: {
          CF_BIN: 'cf-fixture',
          PATH: '/usr/bin',
          CLOUDFLARE_API_TOKEN: 'must-not-pass',
        },
      },
      { exec: (bin, args, options) => runs.push({ bin, args, options }) }
    );
    assert.deepEqual(summary, {
      worker: TASKS_WORKER,
      moduleCount: 2,
      assetCount: 1,
    });
    assert.equal(runs.length, 1);
    assert.equal(runs[0].bin, 'cf-fixture');
    assert.deepEqual(runs[0].args, [
      'deploy',
      '--prebuilt',
      '--mode',
      'production',
      '--dry-run',
      '--no-provision',
    ]);
    assert.equal(runs[0].options.cwd, join(root, 'cf-output'));
    assert.equal(runs[0].options.env.CLOUDFLARE_API_TOKEN, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a non-ESM server module stops the release before upload', async () => {
  const { root, configPath } = tasksArtifact();
  try {
    writeFileSync(join(root, 'dist/server/notes.txt'), 'text module\n');
    const deps = fakeCf();
    await assert.rejects(
      uploadTasksVersion(
        {
          configPath,
          destination: join(root, 'cf-output'),
          servingVersion: V1,
          latestBindings: latestBindings(),
          sourceSha: SHA,
          env: { CF_BIN: 'cf-fixture' },
        },
        { exec: deps.exec, sleep: () => {} }
      ),
      /notes\.txt: unexpected text module/
    );
    assert.deepEqual(deps.calls, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a module file the converter would skip stops the release', async () => {
  const { root, configPath } = tasksArtifact();
  try {
    mkdirSync(join(root, 'dist/server/.hidden'), { recursive: true });
    writeFileSync(join(root, 'dist/server/.hidden/chunk.js'), 'export {};\n');
    await assert.rejects(
      rehearseTasksOutput(
        {
          configPath,
          destination: join(root, 'cf-output'),
          sourceSha: SHA,
          env: { CF_BIN: 'cf-fixture' },
        },
        { exec: () => assert.fail('cf must not run') }
      ),
      /\.hidden\/chunk\.js: module not emitted/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a secret added on the latest undeployed version is accepted as inherited', async () => {
  const { root, configPath } = tasksArtifact();
  try {
    // Serving lacks NEW_SECRET; the latest version (the inheritance source) has it.
    const latest = [
      ...latestBindings(),
      { name: 'NEW_SECRET', type: 'secret_text' },
    ];
    const deps = fakeCf({ live: latestBindings() });
    const exec = (bin, args, options) => {
      const out = deps.exec(bin, args, options);
      if (args.join(' ').startsWith('workers versions create'))
        deps
          .uploaded()
          .bindings.push({ name: 'NEW_SECRET', type: 'secret_text' });
      return out;
    };
    const version = await uploadTasksVersion(
      {
        configPath,
        destination: join(root, 'cf-output'),
        servingVersion: V1,
        latestBindings: latest,
        sourceSha: SHA,
        env: { CF_BIN: 'cf-fixture' },
      },
      { exec, sleep: () => {} }
    );
    assert.equal(version, V2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the rejected candidate is deleted by id on the Tasks Worker', () => {
  const runs = [];
  deleteTasksVersion(V2, {
    env: { CF_BIN: 'cf-fixture' },
    exec: (bin, args) => runs.push([bin, ...args]),
  });
  assert.deepEqual(runs, [
    [
      'cf-fixture',
      'workers',
      'versions',
      'delete',
      V2,
      '--worker-id',
      TASKS_WORKER,
      '--force',
    ],
  ]);
  assert.throws(
    () => deleteTasksVersion('v2', { exec: () => {} }),
    /Tasks version id/
  );
});

function versionsApi({ versions, deployed = [], messages = {} }) {
  const removed = [];
  return {
    removed,
    latestVersion: async () => versions.at(-1),
    read: async (path) => {
      if (path.endsWith('/deployments'))
        return {
          deployments: deployed.map((id) => ({
            versions: [{ version_id: id, percentage: 100 }],
          })),
        };
      const id = path.split('/').at(-1);
      return { id, annotations: { 'workers/message': messages[id] } };
    },
    remove: (id) => {
      removed.push(id);
      versions.pop();
    },
  };
}

test('inheritance starts from the serving or a once-deployed version', async () => {
  for (const [versions, deployed] of [
    [[{ id: V1, number: 1 }], []],
    [
      [
        { id: V1, number: 1 },
        { id: V2, number: 2 },
      ],
      [V2],
    ],
  ]) {
    const api = versionsApi({ versions, deployed });
    assert.equal(
      (await inheritanceSource({ servingVersion: V1, ...api })).id,
      versions.at(-1).id
    );
    assert.deepEqual(api.removed, []);
  }
});

test('an unverified release candidate is deleted before inheriting', async () => {
  const api = versionsApi({
    versions: [
      { id: V1, number: 1 },
      { id: V2, number: 2 },
    ],
    messages: { [V2]: SHA },
  });
  assert.equal(
    (await inheritanceSource({ servingVersion: V1, ...api })).id,
    V1
  );
  assert.deepEqual(api.removed, [V2]);
});

test('an unknown never-deployed latest version stops the release', async () => {
  const api = versionsApi({
    versions: [
      { id: V1, number: 1 },
      { id: V2, number: 2 },
    ],
    messages: { [V2]: 'manual upload' },
  });
  await assert.rejects(
    inheritanceSource({ servingVersion: V1, ...api }),
    /never deployed and is not a release candidate/
  );
  assert.deepEqual(api.removed, []);
});
