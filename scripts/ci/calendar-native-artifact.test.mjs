import './calendar-native-runtime-profile.test.mjs';
import './calendar-ssr-diagnostics.test.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import {
  manifest,
  PRIVATE_CANARY,
  validateOutput,
  verify,
} from './calendar-native-artifact.mjs';

const sha = 'a'.repeat(40);
function fixture(run) {
  const app = mkdtempSync(resolve(tmpdir(), 'calendar-artifact-'));
  const put = (name, data) => {
    const path = resolve(app, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data));
  };
  const pointer = {
    configPath: '../../dist/server/wrangler.json',
    auxiliaryWorkers: [],
  };
  const config = {
    name: 'tuturuuu-calendar',
    main: './worker.js',
    no_bundle: true,
    rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
    d1_databases: [],
    compatibility_date: '2026-10-19',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    workers_dev: false,
    assets: {
      binding: 'ASSETS',
      directory: '../client',
      run_worker_first: true,
      not_found_handling: 'none',
    },
  };
  put('.wrangler/deploy/config.json', pointer);
  put('dist/server/wrangler.json', config);
  put(
    'dist/server/worker.js',
    'export default { fetch() { return new Response("fixture"); } };'
  );
  put('dist/client/serwist/sw.js', 'self.addEventListener("fetch", () => {});');
  put('cloudflare-env.d.ts', 'interface CloudflareEnv { ASSETS: Fetcher }');
  try {
    run({ app, put, pointer, config });
  } finally {
    rmSync(app, { recursive: true, force: true });
  }
}
test('seal survives relocation and binds exact SHA, Worker, pointer and client bytes', () =>
  fixture(({ app, put }) => {
    const receipt = manifest(app, sha);
    verify(app, receipt, sha);
    const relocated = mkdtempSync(resolve(tmpdir(), 'calendar-restored-'));
    try {
      cpSync(app, relocated, { recursive: true });
      verify(relocated, receipt, sha);
    } finally {
      rmSync(relocated, { recursive: true, force: true });
    }
    assert.equal(receipt.main, 'dist/server/worker.js');
    assert.throws(() => verify(app, receipt, 'b'.repeat(40)));
    put('dist/server/worker.js', 'changed');
    assert.throws(() => verify(app, receipt, sha));
  }));
for (const change of [
  (p) => {
    delete p.auxiliaryWorkers;
  },
  (p) => {
    p.auxiliaryWorkers = ['extra'];
  },
  (p) => {
    p.prerender = true;
  },
  (p) => {
    p.configPath = '/tmp/escape';
  },
  (p) => {
    p.configPath = '../../../package.json';
  },
  (p) => {
    p.configPath += '\nconfig=escape';
  },
])
  test(`reject malformed deploy pointer ${change.toString()}`, () =>
    fixture(({ app, put, pointer }) => {
      change(pointer);
      put('.wrangler/deploy/config.json', pointer);
      assert.throws(() => validateOutput(app));
    }));
for (const [field, value] of [
  ['name', 'other'],
  ['account_id', 'invented'],
  ['routes', [{ pattern: 'calendar.invalid' }]],
  ['workers_dev', true],
  ['assets.run_worker_first', false],
  ['assets.not_found_handling', 'single-page-application'],
  ['triggers', { crons: ['* * * * *'] }],
  ['services', [{ binding: 'NEW_SERVICE', service: 'new' }]],
  ['build', { command: 'void deploy' }],
  ['secrets', { required: ['UNREVIEWED_SECRET'] }],
])
  test(`reject unqualified config ${field}`, () =>
    fixture(({ app, put, config }) => {
      changeField(config, field, value);
      put('dist/server/wrangler.json', config);
      assert.throws(() => manifest(app, sha));
    }));
test('reject private client literals, hidden env and symlink additions', () =>
  fixture(({ app, put }) => {
    put('dist/client/leak.js', PRIVATE_CANARY);
    assert.throws(() => manifest(app, sha));
    rmSync(resolve(app, 'dist/client/leak.js'));
    put('dist/client/.dev.vars', 'PRIVATE=value');
    assert.throws(() => manifest(app, sha));
    rmSync(resolve(app, 'dist/client/.dev.vars'));
    symlinkSync(
      resolve(app, 'dist/server/worker.js'),
      resolve(app, 'dist/client/link.js')
    );
    assert.throws(() => manifest(app, sha));
  }));
for (const path of [
  'cloudflare-env.d.ts',
  'dist/client/extra.js',
  '.wrangler/deploy/config.json',
]) {
  test(`seal detects mutation or addition at ${path}`, () =>
    fixture(({ app, put }) => {
      const receipt = manifest(app, sha);
      put(path, 'changed');
      assert.throws(() => verify(app, receipt, sha));
    }));
}
test('legacy Worker entry cannot qualify even if its bundle exists', () =>
  fixture(({ app, put, config }) => {
    put('dist/server/.open-next/worker.js', 'export default {};');
    config.main = '.open-next/worker.js';
    put('dist/server/wrangler.json', config);
    assert.throws(() => validateOutput(app));
  }));
test('source-only discovery excludes mandatory artifact runtime suites', async () => {
  const { createRequire } = await import('node:module');
  const { discoverScriptTests } = createRequire(import.meta.url)(
    '../run-script-tests.js'
  );
  const tests = discoverScriptTests();
  assert.ok(tests.includes('scripts/ci/calendar-native-artifact.test.mjs'));
  assert.ok(!tests.includes('scripts/ci/calendar-native-worker.runtime.mjs'));
  const { readWorkflow } = createRequire(import.meta.url)(
    './workflow-yaml-test-helper.js'
  );
  assertCalendarActors(readWorkflow('mail-calendar-tasks-builds.yaml').jobs);
});
test('accept the owning Cloudflare Vite 1.64 prebundled ESModule output shape', () =>
  fixture(({ app }) => {
    const { config } = validateOutput(app);
    assert.equal(config.no_bundle, true);
    assert.deepEqual(config.rules, [
      { type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] },
    ]);
    assert.equal(manifest(app, sha).main, 'dist/server/worker.js');
  }));
function changeField(config, field, value) {
  const keys = field.split('.');
  const target = keys.slice(0, -1).reduce((node, key) => node[key], config);
  if (value === undefined) delete target[keys.at(-1)];
  else target[keys.at(-1)] = value;
}
for (const [label, field, value] of [
  ['missing no_bundle', 'no_bundle', undefined],
  ['bundle enabled', 'no_bundle', false],
  ['string no_bundle', 'no_bundle', 'true'],
  ['missing rules', 'rules', undefined],
  ['empty rules', 'rules', []],
  ['CommonJS rule', 'rules.0.type', 'CommonJS'],
  ['missing mjs glob', 'rules.0.globs', ['**/*.js']],
  ['extra wildcard glob', 'rules.0.globs.2', '**/*'],
  ['extra module rule', 'rules.1', { type: 'Text', globs: ['**/*.txt'] }],
  ['extra fallthrough property', 'rules.0.fallthrough', true],
  ['extra rule property', 'rules.0.unexpected', true],
])
  test(`reject unsafe or noncanonical emitter shape: ${label}`, () =>
    fixture(({ app, put, config }) => {
      changeField(config, field, value);
      put('dist/server/wrangler.json', config);
      assert.throws(() => validateOutput(app));
    }));
test('both native workflow triggers select Web-only changes and keep Web consumers required', async () => {
  const { createRequire } = await import('node:module');
  const { readWorkflow } = createRequire(import.meta.url)(
    './workflow-yaml-test-helper.js'
  );
  const workflow = readWorkflow('mail-calendar-tasks-builds.yaml');
  for (const event of ['pull_request', 'push']) {
    assert.ok(
      workflow.on[event].paths.includes('apps/web/**'),
      `${event} must select Web-only changes`
    );
  }
  assert.equal(workflow.jobs['build-web'].name, 'build (web)');
  const steps = workflow.jobs['calendar-native'].steps;
  const webTests = steps.find((step) =>
    step.run?.includes('bun run --cwd apps/web test')
  );
  const webTypes = steps.find((step) =>
    step.with?.command?.includes(
      'type-check --filter=@tuturuuu/calendar --filter=@tuturuuu/web'
    )
  );
  assert.ok(webTests, 'owning Web tests must remain required');
  assert.ok(webTypes, 'affected Web consumer types must remain required');
  assert.equal(webTypes.uses, './.github/actions/run-with-turbo-remote-cache');
  for (const step of [webTests, webTypes]) {
    assert.equal(step.if, undefined);
    assert.equal(step['continue-on-error'], undefined);
  }
});

function artifactCli(args) {
  return spawnSync(
    process.execPath,
    [
      new URL('./calendar-native-artifact.mjs', import.meta.url).pathname,
      ...args,
    ],
    { encoding: 'utf8', timeout: 10000 }
  );
}
test('actual CLI seals and verifies only the explicitly supplied exact source SHA', () =>
  fixture(({ app }) => {
    const receipt = resolve(app, 'receipt.json');
    const sealed = artifactCli(['seal', app, sha, receipt]);
    assert.equal(sealed.status, 0, sealed.stderr);
    assert.equal(JSON.parse(readFileSync(receipt, 'utf8')).sha, sha);
    const verified = artifactCli(['verify', app, sha, receipt]);
    assert.equal(verified.status, 0, verified.stderr);
    const mismatch = artifactCli(['verify', app, 'b'.repeat(40), receipt]);
    assert.equal(mismatch.signal, null);
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stderr, /artifact identity or bytes changed/);
  }));
for (const supplied of [undefined, 'short', 'A'.repeat(40), 'g'.repeat(40)]) {
  test(`actual CLI rejects missing or invalid exact SHA: ${supplied}`, () =>
    fixture(({ app }) => {
      for (const mode of ['seal', 'verify', 'config']) {
        const args =
          supplied === undefined ? [mode, app] : [mode, app, supplied];
        const result = artifactCli(args);
        assert.equal(result.signal, null);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /exact source SHA required/);
      }
    }));
}
test('actual Worker-suite CLI rejects a missing SHA before artifact or runtime setup', () => {
  const result = spawnSync(
    process.execPath,
    [new URL('./calendar-native-worker.runtime.mjs', import.meta.url).pathname],
    { encoding: 'utf8', timeout: 10000 }
  );
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /exact source SHA required/);
});
function calendarActor(job, name) {
  const actors = job.steps.filter((step) => step.name === name);
  assert.equal(actors.length, 1, `unique actor: ${name}`);
  return actors[0];
}
function assertCalendarActors(jobs) {
  for (const job of Object.values(jobs)) {
    assert.equal(job['continue-on-error'], undefined);
    if (Object.hasOwn(job, 'uses')) {
      assert.equal(typeof job.uses, 'string');
      assert.equal(Object.hasOwn(job, 'steps'), false);
      continue;
    }
    assert.ok(Array.isArray(job.steps));
    for (const step of job.steps) {
      assert.equal(step['continue-on-error'], undefined);
      for (const command of (step.run ?? '').split('\n')) {
        if (command.includes('wrangler deploy'))
          assert.match(command, /wrangler deploy --dry-run/);
      }
    }
  }
  const cli = 'node scripts/ci/calendar-native-artifact.mjs';
  for (const name of ['calendar-native', 'calendar-artifact-restore']) {
    const job = jobs[name];
    assert.equal(
      job.env.SOURCE_SHA,
      `\${{ github.event.pull_request.head.sha || github.sha }}`
    );
    const calls = job.steps
      .flatMap((step) => (step.run ?? '').split('\n'))
      .filter((line) =>
        /node scripts\/ci\/calendar-native-(artifact|worker)/.test(line)
      );
    for (const call of calls) assert.match(call, /"\$SOURCE_SHA"/);
    const identity = calendarActor(
      job,
      name === 'calendar-native'
        ? 'Assert source and toolchain identity'
        : 'Assert restored-job source and toolchain identity'
    );
    assert.equal(
      identity.run.trim().split('\n')[0],
      'test "$(git rev-parse HEAD)" = "$SOURCE_SHA"'
    );
    assert.equal(identity.if, undefined);
    assert.equal(identity['continue-on-error'], undefined);
  }
  const restored = jobs['calendar-artifact-restore'];
  for (const [name, command] of [
    [
      'Verify exact source seal after relocation',
      `${cli} verify apps/calendar "$SOURCE_SHA" apps/calendar/calendar-artifact.json`,
    ],
    ['Discover restored config', `${cli} config apps/calendar "$SOURCE_SHA"`],
    [
      'Recheck actual restored Worker public routes',
      'node scripts/ci/calendar-native-worker.runtime.mjs "$SOURCE_SHA"',
    ],
    [
      'Recheck restored offline asset behavior',
      'node --test src/runtime/offline-artifact.runtime.mjs',
    ],
    [
      'Verify final restored artifact seal',
      `${cli} verify apps/calendar "$SOURCE_SHA" apps/calendar/calendar-artifact.json`,
    ],
  ]) {
    const actor = calendarActor(restored, name);
    assert.equal(actor.run, command);
    assert.equal(actor.if, undefined);
    assert.equal(actor['continue-on-error'], undefined);
  }
  const job = jobs['calendar-native'];
  const names = [
    'Discover and qualify emitted Worker config',
    'Seal source and emitted artifact identity',
    'Exercise exact emitted Worker public routes',
    'Exercise exact emitted offline asset',
    'Verify runtime checks left the sealed artifact unchanged',
  ];
  const actors = names.map((name) => calendarActor(job, name));
  actors.forEach((step, i) => {
    assert.equal(step.if, undefined);
    assert.equal(step['continue-on-error'], undefined);
    if (i)
      assert.ok(job.steps.indexOf(step) > job.steps.indexOf(actors[i - 1]));
  });
  assert.equal(actors[0].run, `${cli} config apps/calendar "$SOURCE_SHA"`);
  assert.equal(actors[1].id, 'calendar-canonical-seal');
  assert.equal(
    actors[1].run,
    `${cli} seal apps/calendar "$SOURCE_SHA" apps/calendar/calendar-artifact.json`
  );
  assert.equal(
    actors[2].run,
    'node scripts/ci/calendar-native-worker.runtime.mjs "$SOURCE_SHA"'
  );
  assert.equal(
    actors[3].run,
    'node --test src/runtime/offline-artifact.runtime.mjs'
  );
  assert.equal(
    actors[4].run.trim().split('\n')[0],
    `${cli} verify apps/calendar "$SOURCE_SHA" apps/calendar/calendar-artifact.json`
  );
  const debug = calendarActor(
    job,
    'Verify and pack failed-job sealed source for debugging'
  );
  assert.equal(debug.id, 'calendar-debug-pack');
  assert.equal(
    debug.if,
    `\${{ failure() && steps.calendar-canonical-seal.outcome == 'success' }}`
  );
  assert.equal(debug.env.WORKFLOW_SOURCE_SHA, `\${{ github.workflow_sha }}`);
  const lines = debug.run.trim().split('\n');
  assert.equal(lines[0], 'test "$(git rev-parse HEAD)" = "$SOURCE_SHA"');
  const evidence = lines.filter(
    (line) => line.startsWith(cli) || /^(tar |cmp )/.test(line)
  );
  assert.deepEqual(evidence, [
    `${cli} verify apps/calendar "$SOURCE_SHA" apps/calendar/calendar-artifact.json`,
    'tar -czf "$RUNNER_TEMP/calendar-debug-sealed-source.tar.gz" -C apps/calendar dist "$pointer" cloudflare-env.d.ts calendar-artifact.json',
    'tar -xzf "$RUNNER_TEMP/calendar-debug-sealed-source.tar.gz" -C "$verify_dir"',
    'cmp "apps/calendar/calendar-artifact.json" "$verify_dir/calendar-artifact.json"',
    `${cli} verify "$verify_dir" "$SOURCE_SHA" "$verify_dir/calendar-artifact.json"`,
    `${cli} verify apps/calendar "$SOURCE_SHA" apps/calendar/calendar-artifact.json`,
  ]);
  assert.equal(
    lines.at(-2),
    'printf \'classification=DEBUG sealed source; NOT qualified release\\nexpected_source_sha=%s\\ncheckout_head=%s\\ngithub_sha=%s\\nworkflow_source_sha=%s\\nevent_name=%s\\nrun_id=%s\\nrun_attempt=%s\\n\' "$SOURCE_SHA" "$(git rev-parse HEAD)" "$GITHUB_SHA" "$WORKFLOW_SOURCE_SHA" "$GITHUB_EVENT_NAME" "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" > "$RUNNER_TEMP/calendar-debug-sealed-source.txt"'
  );
  assert.equal(
    lines.at(-1),
    'sha256sum "$RUNNER_TEMP/calendar-debug-sealed-source.tar.gz" "apps/calendar/calendar-artifact.json" >> "$RUNNER_TEMP/calendar-debug-sealed-source.txt"'
  );
  const upload = calendarActor(
    job,
    'Retain failed-job sealed source for debugging'
  );
  assert.equal(
    upload.if,
    `\${{ failure() && steps.calendar-canonical-seal.outcome == 'success' && steps.calendar-debug-pack.outcome == 'success' }}`
  );
  assert.equal(upload.with['retention-days'], 3);
}
test('Calendar actor guards reject missing, moved, duplicate and forged source evidence', async () => {
  const { createRequire } = await import('node:module');
  const { readWorkflow } = createRequire(import.meta.url)(
    './workflow-yaml-test-helper.js'
  );
  const { jobs } = readWorkflow('mail-calendar-tasks-builds.yaml');
  assertCalendarActors(jobs);
  const reusable = { uses: './.github/workflows/ci-check.yml' };
  assertCalendarActors({ ...jobs, reusable });
  for (const invalid of [
    { ...reusable, 'continue-on-error': true },
    { ...reusable, steps: [] },
    {},
    { steps: {} },
  ]) {
    assert.throws(() => assertCalendarActors({ ...jobs, invalid }));
  }
  for (const kind of [
    'removed',
    'moved',
    'duplicate',
    'source',
    'workflow',
    'receipt',
    'event',
    'hash',
    'build-continue',
    'build-step-continue',
    'build-deploy',
  ]) {
    const copy = structuredClone(jobs),
      job = copy['calendar-native'],
      build = copy['build-web'];
    const seal = calendarActor(
      job,
      'Seal source and emitted artifact identity'
    );
    const debug = calendarActor(
      job,
      'Verify and pack failed-job sealed source for debugging'
    );
    if (kind === 'removed') job.steps.splice(job.steps.indexOf(seal), 1);
    if (kind === 'moved') {
      job.steps.splice(job.steps.indexOf(seal), 1);
      job.steps.push(seal);
    }
    if (kind === 'duplicate') job.steps.push(seal);
    if (kind === 'source')
      debug.run = debug.run.replaceAll('"$SOURCE_SHA"', '"$GITHUB_SHA"');
    if (kind === 'workflow')
      debug.env.WORKFLOW_SOURCE_SHA = `\${{ github.sha }}`;
    if (kind === 'event')
      debug.run = debug.run.replace('"$GITHUB_EVENT_NAME"', '"$GITHUB_SHA"');
    if (kind === 'receipt') debug.run = debug.run.replace('cmp ', 'echo ');
    if (kind === 'hash') debug.run = debug.run.replace('sha256sum', 'echo');
    if (kind === 'build-continue') build['continue-on-error'] = true;
    if (kind === 'build-step-continue')
      build.steps[0]['continue-on-error'] = true;
    if (kind === 'build-deploy')
      build.steps.push({ run: 'bun x wrangler deploy' });
    assert.throws(() => assertCalendarActors(copy));
  }
});
function savePointer(app) {
  mkdirSync(resolve(app, '.void'));
  renameSync(
    resolve(app, '.wrangler/deploy/config.json'),
    resolve(app, '.void/preview-deploy-config.json')
  );
}
test('saved Void bytes use the native base and survive selected-file relocation', () =>
  fixture(({ app, put }) => {
    const bytes = readFileSync(resolve(app, '.wrangler/deploy/config.json'));
    savePointer(app);
    assert.deepEqual(
      readFileSync(resolve(app, '.void/preview-deploy-config.json')),
      bytes
    );
    assert.equal(
      validateOutput(app).configPath,
      resolve(app, 'dist/server/wrangler.json')
    );
    const receipt = manifest(app, sha);
    assert.ok(receipt.files['.void/preview-deploy-config.json']);
    assert.equal(receipt.files['.wrangler/deploy/config.json'], undefined);
    const restored = mkdtempSync(resolve(tmpdir(), 'calendar-saved-restored-'));
    try {
      for (const path of [
        'dist',
        '.void/preview-deploy-config.json',
        'cloudflare-env.d.ts',
      ]) {
        const target = resolve(restored, path);
        mkdirSync(dirname(target), { recursive: true });
        cpSync(resolve(app, path), target, { recursive: true });
      }
      verify(restored, receipt, sha);
      assert.throws(() => verify(restored, receipt, 'b'.repeat(40)));
      writeFileSync(resolve(restored, 'dist/server/worker.js'), 'changed');
      assert.throws(() => verify(restored, receipt, sha));
    } finally {
      rmSync(restored, { recursive: true, force: true });
    }
    put('.void/preview-deploy-config.json', `${bytes.toString()}\n`);
    assert.throws(() => verify(app, receipt, sha));
  }));
test('a seal binds pointer location even when bytes stay identical', () =>
  fixture(({ app }) => {
    const receipt = manifest(app, sha);
    savePointer(app);
    validateOutput(app);
    assert.throws(() => verify(app, receipt, sha));
  }));
for (const kind of [
  'absent',
  'dual',
  'dangling dual',
  'saved symlink',
  'dangling saved',
  'ancestor symlink',
  'directory',
]) {
  test(`saved pointer rejects ${kind}`, () =>
    fixture(({ app, put }) => {
      savePointer(app);
      const saved = resolve(app, '.void/preview-deploy-config.json');
      const native = resolve(app, '.wrangler/deploy/config.json');
      if (kind === 'dual')
        put('.wrangler/deploy/config.json', readFileSync(saved).toString());
      else if (kind === 'dangling dual')
        symlinkSync(resolve(app, 'missing'), native);
      else if (kind === 'ancestor symlink') {
        renameSync(resolve(app, '.void'), resolve(app, 'saved-pointer'));
        symlinkSync(resolve(app, 'saved-pointer'), resolve(app, '.void'));
      } else {
        renameSync(saved, resolve(app, 'pointer-copy.json'));
        if (kind === 'saved symlink')
          symlinkSync(resolve(app, 'pointer-copy.json'), saved);
        if (kind === 'dangling saved')
          symlinkSync(resolve(app, 'missing'), saved);
        if (kind === 'directory') mkdirSync(saved);
      }
      assert.throws(() => validateOutput(app));
    }));
}
for (const [label, field, value] of [
  ['absolute', 'configPath', '/tmp/wrangler.json'],
  ['escape', 'configPath', '../../../wrangler.json'],
  ['saved-directory base', 'configPath', '../dist/server/wrangler.json'],
  ['multiline', 'configPath', '../../dist/server/wrangler.json\nconfig=escape'],
  ['auxiliary Worker', 'auxiliaryWorkers', ['extra']],
  ['extra field', 'extra', true],
]) {
  test(`saved pointer rejects ${label}`, () =>
    fixture(({ app, put, pointer }) => {
      savePointer(app);
      changeField(pointer, field, value);
      put('.void/preview-deploy-config.json', pointer);
      assert.throws(() => validateOutput(app));
    }));
}
for (const [label, field, value] of [
  ['identity', 'name', 'other'],
  ['compatibility date', 'compatibility_date', '2026-10-18'],
  ['compatibility flags', 'compatibility_flags', []],
  ['worker publication', 'workers_dev', true],
  ['placement', 'placement', { mode: 'smart' }],
  [
    'Durable Objects',
    'durable_objects',
    { bindings: [{ name: 'DO', class_name: 'Room' }] },
  ],
  ['storage', 'r2_buckets', [{ binding: 'BUCKET', bucket_name: 'other' }]],
  ['secrets', 'secrets', { required: ['UNREVIEWED_SECRET'] }],
  ['environment', 'env', { production: {} }],
  ['assets binding', 'assets.binding', 'OTHER'],
  ['assets routing', 'assets.run_worker_first', false],
  ['SPA fallback', 'assets.not_found_handling', 'single-page-application'],
  ['Worker escape', 'main', '../../outside.js'],
]) {
  test(`saved pointer retains qualification: ${label}`, () =>
    fixture(({ app, put, config }) => {
      savePointer(app);
      changeField(config, field, value);
      put('dist/server/wrangler.json', config);
      assert.throws(() => manifest(app, sha));
    }));
}
test('saved pointer retains complete artifact and private-client fences', () =>
  fixture(({ app, put }) => {
    savePointer(app);
    put('dist/server/module.wasm', 'wasm-fixture');
    put('dist/client/font.woff2', 'font-fixture');
    const receipt = manifest(app, sha);
    put('dist/client/font.woff2', 'changed-font');
    assert.throws(() => verify(app, receipt, sha));
    put('dist/client/font.woff2', 'font-fixture');
    put('dist/server/module.wasm', 'changed-wasm');
    assert.throws(() => verify(app, receipt, sha));
    put('dist/server/module.wasm', 'wasm-fixture');
    put('dist/client/leak.js', PRIVATE_CANARY);
    assert.throws(() => manifest(app, sha));
    rmSync(resolve(app, 'dist/client/leak.js'));
    symlinkSync(
      resolve(app, 'dist/server/worker.js'),
      resolve(app, 'dist/client/link.js')
    );
    assert.throws(() => manifest(app, sha));
  }));

for (const saved of [false, true]) {
  test(`workflow archive restores the selected ${saved ? 'saved' : 'native'} pointer`, async () => {
    const { createRequire } = await import('node:module');
    const { readWorkflow } = createRequire(import.meta.url)(
      './workflow-yaml-test-helper.js'
    );
    const { jobs } = readWorkflow('mail-calendar-tasks-builds.yaml');
    const archive = calendarActor(
      jobs['calendar-native'],
      'Verify runtime checks left the sealed artifact unchanged'
    );
    assert.ok(
      archive.run.startsWith(
        'node scripts/ci/calendar-native-artifact.mjs verify '
      )
    );
    const commands = archive.run.split('\n').slice(1).join('\n');
    fixture(({ app, put }) => {
      if (saved) savePointer(app);
      put('.void/private-state.json', 'must not ship');
      const receipt = manifest(app, sha);
      put('calendar-artifact.json', receipt);
      const sandbox = mkdtempSync(resolve(tmpdir(), 'calendar-archive-'));
      try {
        mkdirSync(resolve(sandbox, 'apps'));
        cpSync(app, resolve(sandbox, 'apps/calendar'), { recursive: true });
        const packed = spawnSync('bash', ['-e', '-c', commands], {
          cwd: sandbox,
          env: { ...process.env, RUNNER_TEMP: sandbox },
          encoding: 'utf8',
          timeout: 10000,
        });
        assert.equal(packed.status, 0, packed.stderr);
        const restored = resolve(sandbox, 'restored');
        mkdirSync(restored);
        const unpacked = spawnSync(
          'tar',
          ['-xzf', resolve(sandbox, 'calendar-worker.tar.gz'), '-C', restored],
          {
            encoding: 'utf8',
            timeout: 10000,
          }
        );
        assert.equal(unpacked.status, 0, unpacked.stderr);
        verify(
          restored,
          JSON.parse(
            readFileSync(resolve(restored, 'calendar-artifact.json'), 'utf8')
          ),
          sha
        );
        assert.throws(
          () => readFileSync(resolve(restored, '.void/private-state.json')),
          { code: 'ENOENT' }
        );
      } finally {
        rmSync(sandbox, { recursive: true, force: true });
      }
    });
  });
}
