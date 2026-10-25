import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { calendarFixture } from './calendar-cf-fixture.mjs';
import {
  emitCalendarOutput,
  verifyCalendarOutput,
} from './calendar-cf-output.mjs';
import { manifest } from './calendar-native-artifact.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const sha = 'b'.repeat(40);
const outputPrefix = '.cloudflare/output/v0/';

function fixture(t) {
  const directory = calendarFixture(t, 'calendar-cf-output-');
  const app = join(directory, 'app');
  mkdirSync(app);
  const put = (name, value, base = app) => {
    const path = join(base, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      Buffer.isBuffer(value) || typeof value === 'string'
        ? value
        : JSON.stringify(value)
    );
    return path;
  };
  cpSync(join(root, 'apps/calendar/package.json'), join(app, 'package.json'));
  put('.void/preview-deploy-config.json', {
    configPath: '../../dist/server/config.json',
    auxiliaryWorkers: [],
  });
  const config = {
    name: 'tuturuuu-calendar',
    main: './worker.js',
    compatibility_date: '2026-10-19',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    workers_dev: false,
    no_bundle: true,
    rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
    assets: {
      binding: 'ASSETS',
      directory: '../client',
      run_worker_first: true,
      not_found_handling: 'none',
    },
  };
  put('dist/server/config.json', config);
  put(
    'dist/server/worker.js',
    'import { value } from "./nested/chunk.js"; export default {fetch(){return new Response(value);}};'
  );
  put('dist/server/nested/chunk.js', 'export const value = "fixture";');
  put('dist/server/.vite/manifest.json', {
    entry: { file: 'worker.js', imports: ['chunk'] },
    chunk: { file: 'nested/chunk.js' },
  });
  put('dist/client/serwist/sw.js', 'self.addEventListener("fetch", () => {});');
  put('dist/client/assets/binary.bin', Buffer.from([0, 127, 128, 255]));
  put(
    'dist/client/_headers',
    '/assets/*\n  Cache-Control: public, max-age=60\n'
  );
  put('dist/client/_redirects', '/old /new 302\n');
  mkdirSync(join(app, 'dist/client/empty'));
  put('cloudflare-env.d.ts', 'interface CloudflareEnv { ASSETS: Fetcher; }');
  const seal = () => put('calendar-artifact.json', manifest(app, sha));
  seal();
  const destination = join(directory, 'comparison');
  return { app, destination, put, seal, directory, config };
}

const options = (f) => ({
  appDirectory: f.app,
  destination: f.destination,
  sourceSha: sha,
});

test('complete output preserves module paths, binary/static assets and immutable source bytes', async (t) => {
  const f = fixture(t);
  const seal = readFileSync(join(f.app, 'calendar-artifact.json'));
  const receipt = await emitCalendarOutput(options(f));
  assert.equal(receipt.sourceSha, sha);
  assert.equal(receipt.suppliers['@cloudflare/config'], '0.27.0');
  assert.equal(receipt.suppliers['@cloudflare/build-output-utils'], '0.9.3');
  assert.equal(receipt.publicationQualified, false);
  assert.equal(receipt.accountQualified, false);
  assert.deepEqual(receipt.unqualifiedAssetControlFiles, [
    { path: '.assetsignore', present: false },
    { path: '_headers', present: true },
    { path: '_redirects', present: true },
  ]);
  assert.deepEqual(receipt.secondaryModuleNames, [
    { source: 'nested/chunk.js', cfUpload: './nested/chunk.js' },
  ]);
  assert.deepEqual(receipt.excludedServerMetadata, [
    '.vite/manifest.json',
    'config.json',
  ]);
  for (const name of ['worker.js', 'nested/chunk.js'])
    assert.deepEqual(
      readFileSync(
        join(f.destination, outputPrefix, 'workers/default/bundle', name)
      ),
      readFileSync(join(f.app, 'dist/server', name))
    );
  for (const name of [
    'serwist/sw.js',
    'assets/binary.bin',
    '_headers',
    '_redirects',
  ])
    assert.deepEqual(
      readFileSync(
        join(f.destination, outputPrefix, 'workers/default/assets', name)
      ),
      readFileSync(join(f.app, 'dist/client', name))
    );
  assert.ok(
    existsSync(
      join(f.destination, outputPrefix, 'workers/default/assets/empty')
    )
  );
  assert.deepEqual(readFileSync(join(f.app, 'calendar-artifact.json')), seal);
  assert.deepEqual(await verifyCalendarOutput(options(f)), receipt);
});

for (const name of [
  'workers/default/bundle/worker.js',
  'workers/default/bundle/nested/chunk.js',
  'workers/default/assets/assets/binary.bin',
  'workers/default/assets/_headers',
  'workers/default/assets/_redirects',
  'config.json',
  'workers/default/worker.config.json',
]) {
  test(`mutated output fails parity: ${name}`, async (t) => {
    const f = fixture(t);
    await emitCalendarOutput(options(f));
    writeFileSync(join(f.destination, outputPrefix, name), 'changed');
    await assert.rejects(
      verifyCalendarOutput(options(f)),
      /paths or bytes differ/
    );
  });
}

for (const mode of [
  'missing module',
  'extra module',
  'extra directory',
  'symlink',
  'receipt',
]) {
  test(`reject ${mode} in comparison output`, async (t) => {
    const f = fixture(t);
    await emitCalendarOutput(options(f));
    const bundle = join(f.destination, outputPrefix, 'workers/default/bundle');
    if (mode === 'missing module') rmSync(join(bundle, 'nested/chunk.js'));
    if (mode === 'extra module')
      writeFileSync(join(bundle, 'extra.js'), 'export default 1;');
    if (mode === 'extra directory') mkdirSync(join(bundle, 'unqualified'));
    if (mode === 'symlink')
      symlinkSync(
        join(f.app, 'dist/server/worker.js'),
        join(bundle, 'link.js')
      );
    if (mode === 'receipt')
      writeFileSync(join(f.destination, 'parity.json'), '{}');
    await assert.rejects(
      verifyCalendarOutput(options(f)),
      /paths or bytes differ|symlinks forbidden|receipt differs/
    );
  });
}

test('missing or changed source seal fails before creating an output', async (t) => {
  const f = fixture(t);
  f.put('dist/server/nested/chunk.js', 'changed after source seal');
  await assert.rejects(
    emitCalendarOutput(options(f)),
    /identity or bytes changed/
  );
  assert.equal(existsSync(f.destination), false);
});

test('orphan source maps and data modules require explicit qualification', async (t) => {
  for (const name of ['orphan.js.map', 'data.json', 'runtime.wasm']) {
    const f = fixture(t);
    f.put(`dist/server/${name}`, '{}');
    f.seal();
    await assert.rejects(
      emitCalendarOutput(options(f)),
      /unqualified server file/
    );
    assert.equal(existsSync(f.destination), false);
  }
});

test('paired ESM source maps remain sealed metadata outside the upload manifest', async (t) => {
  const f = fixture(t);
  const name = 'nested/chunk.js.map';
  f.put(
    `dist/server/${name}`,
    '{"version":3,"sources":["source.ts"],"mappings":""}'
  );
  f.seal();
  const receipt = await emitCalendarOutput(options(f));
  assert.ok(receipt.excludedServerMetadata.includes(name));
  assert.equal(typeof receipt.sourceFiles[`dist/server/${name}`], 'string');
  const config = JSON.parse(
    readFileSync(
      join(f.destination, outputPrefix, 'workers/default/worker.config.json')
    )
  );
  assert.equal(Object.hasOwn(config.manifest.modules, name), false);
  assert.equal(
    existsSync(
      join(f.destination, outputPrefix, 'workers/default/bundle', name)
    ),
    false
  );
  await verifyCalendarOutput(options(f));
  f.put(`dist/server/${name}`, '{"version":3,"mappings":"changed"}');
  await assert.rejects(
    verifyCalendarOutput(options(f)),
    /identity or bytes changed/
  );
});

test('manifest-listed hashed server CSS and fonts become sealed static assets', async (t) => {
  const f = fixture(t);
  const font = 'assets/noto-sans-latin-wght-normal-BYSzYMf3.woff2';
  const css = 'assets/router-B8ffZdGS.css';
  const fontBytes = Buffer.from([0, 1, 2, 255]);
  const cssBytes = Buffer.from(
    '@font-face{src:url(/assets/noto-sans-latin-wght-normal-BYSzYMf3.woff2)}'
  );
  f.put(`dist/server/${font}`, fontBytes);
  f.put(`dist/client/${font}`, fontBytes);
  f.put(`dist/server/${css}`, cssBytes);
  f.put('dist/client/assets/index-B8ffZdGS.css', cssBytes);
  f.put('dist/server/.vite/manifest.json', {
    entry: { file: 'worker.js', imports: ['chunk'] },
    chunk: { file: 'nested/chunk.js' },
    font: { file: font },
    'src/router.tsx': {
      file: 'nested/chunk.js',
      css: [css],
      assets: [font],
    },
  });
  f.seal();
  const receipt = await emitCalendarOutput(options(f));
  assert.deepEqual(receipt.routedServerAssets, [font, css]);
  const output = join(f.destination, outputPrefix, 'workers/default');
  for (const [name, bytes] of [
    [font, fontBytes],
    [css, cssBytes],
  ]) {
    assert.deepEqual(readFileSync(join(output, 'assets', name)), bytes);
    assert.equal(existsSync(join(output, 'bundle', name)), false);
    assert.equal(typeof receipt.sourceFiles[`dist/server/${name}`], 'string');
  }
  const config = JSON.parse(readFileSync(join(output, 'worker.config.json')));
  assert.equal(Object.hasOwn(config.manifest.modules, font), false);
  assert.equal(Object.hasOwn(config.manifest.modules, css), false);
  await verifyCalendarOutput(options(f));
  f.put(`dist/server/${font}`, Buffer.from([0, 1, 2, 0]));
  await assert.rejects(
    verifyCalendarOutput(options(f)),
    /identity or bytes changed/
  );
});

test('orphan, unhashed and unknown server assets remain unqualified', async (t) => {
  for (const [name, listed] of [
    ['assets/orphan-BYSzYMf3.woff2', false],
    ['assets/router.css', true],
    ['assets/runtime-BYSzYMf3.wasm', true],
  ]) {
    const f = fixture(t);
    f.put(`dist/server/${name}`, 'unqualified');
    if (listed)
      f.put('dist/server/.vite/manifest.json', {
        entry: { file: 'worker.js', assets: [name] },
      });
    f.seal();
    await assert.rejects(
      emitCalendarOutput(options(f)),
      /unqualified server file/
    );
    assert.equal(existsSync(f.destination), false);
  }
});

test('server and client copies of an asset must have the same sealed bytes', async (t) => {
  const f = fixture(t);
  const name = 'assets/font-BYSzYMf3.woff2';
  f.put(`dist/server/${name}`, Buffer.from([1, 2, 3]));
  f.put(`dist/client/${name}`, Buffer.from([1, 2, 4]));
  f.put('dist/server/.vite/manifest.json', {
    entry: { file: 'worker.js', assets: [name] },
  });
  f.seal();
  await assert.rejects(
    emitCalendarOutput(options(f)),
    /server and client asset bytes differ/
  );
  assert.equal(existsSync(f.destination), false);
});

test('an existing output remains owned and untouched', async (t) => {
  const f = fixture(t);
  mkdirSync(f.destination);
  f.put('owner.txt', 'another owner', f.destination);
  await assert.rejects(emitCalendarOutput(options(f)), /EEXIST/);
  assert.equal(
    readFileSync(join(f.destination, 'owner.txt'), 'utf8'),
    'another owner'
  );
});

test('source symlinks are rejected before any output', async (t) => {
  const f = fixture(t);
  symlinkSync(
    join(f.app, 'dist/server/worker.js'),
    join(f.app, 'dist/server/link.js')
  );
  await assert.rejects(emitCalendarOutput(options(f)), /symlinks forbidden/);
  assert.equal(existsSync(f.destination), false);
});

test('output verification survives relocation and still detects source drift', async (t) => {
  const f = fixture(t);
  const receipt = await emitCalendarOutput(options(f));
  const relocatedApp = join(f.directory, 'restored-app');
  const relocatedOutput = join(f.directory, 'restored-output');
  cpSync(f.app, relocatedApp, { recursive: true });
  cpSync(f.destination, relocatedOutput, { recursive: true });
  const restored = {
    appDirectory: relocatedApp,
    sourceSha: sha,
    destination: relocatedOutput,
  };
  assert.deepEqual(await verifyCalendarOutput(restored), receipt);
  writeFileSync(
    join(relocatedApp, 'dist/client/serwist/sw.js'),
    'changed after restore'
  );
  await assert.rejects(
    verifyCalendarOutput(restored),
    /identity or bytes changed/
  );
});

test('actual emit and verify CLI read modules as data without executing Worker code', (t) => {
  const f = fixture(t);
  f.put(
    'dist/server/worker.js',
    'throw new Error("Worker must never execute during emission"); export default {};'
  );
  f.seal();
  for (const mode of ['emit', 'verify']) {
    const result = spawnSync(
      process.execPath,
      [
        join(root, 'scripts/ci/calendar-cf-output.mjs'),
        mode,
        f.app,
        sha,
        f.destination,
      ],
      { encoding: 'utf8' }
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).publicationQualified, false);
  }
});

test('real workflow qualifies before runtime and compares a same-run restored output', () => {
  const require = createRequire(import.meta.url);
  const { readWorkflow } = require('./workflow-yaml-test-helper.js');
  const workflow = readWorkflow('mail-calendar-tasks-builds.yaml');
  const native = workflow.jobs['calendar-native'].steps;
  const restore = workflow.jobs['calendar-artifact-restore'].steps;
  const at = (steps, name) => steps.findIndex((step) => step.name === name);
  assert.ok(
    at(native, 'Qualify Calendar cf Build Output without publication') >
      at(native, 'Seal source and emitted artifact identity')
  );
  assert.ok(
    at(native, 'Qualify Calendar cf Build Output without publication') <
      at(native, 'Exercise exact emitted Worker public routes')
  );
  assert.match(
    native.find(
      (step) =>
        step.name === 'Qualify Calendar cf Build Output without publication'
    ).run,
    /calendar-cf-output\.mjs emit apps\/calendar "\$SOURCE_SHA" "\$RUNNER_TEMP\/calendar-cf-output"/
  );
  const cfVerification = native.find(
    (step) => step.name === 'Verify cf comparison after runtime checks'
  );
  assert.match(
    cfVerification.run,
    /calendar-cf-output\.mjs verify apps\/calendar/
  );
  assert.notEqual(cfVerification['continue-on-error'], true);
  assert.ok(
    at(native, cfVerification.name) >
      at(native, 'Exercise exact emitted offline asset')
  );
  assert.ok(
    at(native, cfVerification.name) <
      at(native, 'Verify runtime checks left the sealed artifact unchanged')
  );
  const uploaded = native.find(
    (step) => step.name === 'Retain Calendar cf comparison output'
  );
  const downloaded = restore.find(
    (step) => step.name === 'Download same-run cf comparison archive'
  );
  assert.equal(uploaded.with.name, downloaded.with.name);
  assert.match(uploaded.with.path, /\/calendar-cf-output\.tar\.gz$/);
  assert.match(downloaded.with.path, /\/calendar-cf-output-download$/);
  assert.ok(
    at(native, 'Pack verified Calendar cf comparison output') <
      at(native, 'Retain Calendar cf comparison output')
  );
  assert.equal(uploaded.with['include-hidden-files'], true);
  assert.equal(uploaded.with['if-no-files-found'], 'error');
  assert.ok(
    at(
      restore,
      'Verify relocated cf comparison against the exact sealed source'
    ) > at(restore, 'Verify exact source seal after relocation')
  );
});

test('archive transport preserves the exact inventory including empty directories', async (t) => {
  const require = createRequire(import.meta.url);
  const { readWorkflow } = require('./workflow-yaml-test-helper.js');
  const workflow = readWorkflow('mail-calendar-tasks-builds.yaml');
  const pack = workflow.jobs['calendar-native'].steps.find(
    (step) => step.name === 'Pack verified Calendar cf comparison output'
  );
  const unpack = workflow.jobs['calendar-artifact-restore'].steps.find(
    (step) => step.name === 'Restore same-run cf comparison output'
  );
  assert.ok(
    pack?.run,
    'comparison tree requires archive packing before upload'
  );
  assert.ok(unpack?.run, 'comparison archive requires explicit restore');
  assert.match(unpack.run, /--no-same-owner/);
  const f = fixture(t);
  const destination = join(f.directory, 'calendar-cf-output');
  const receipt = await emitCalendarOutput({ ...options(f), destination });
  const execute = (script) => {
    const result = spawnSync(
      'bash',
      ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script],
      { encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: f.directory } }
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  };
  execute(pack.run);
  const download = join(f.directory, 'calendar-cf-output-download');
  mkdirSync(download);
  cpSync(
    join(f.directory, 'calendar-cf-output.tar.gz'),
    join(download, 'calendar-cf-output.tar.gz')
  );
  execute(unpack.run);
  const restored = join(f.directory, 'calendar-cf-output-restored');
  assert.ok(
    existsSync(join(restored, outputPrefix, 'workers/default/assets/empty'))
  );
  assert.deepEqual(
    await verifyCalendarOutput({ ...options(f), destination: restored }),
    receipt
  );
});

for (const kind of ['absolute', 'traversal', 'symlink', 'hardlink']) {
  test(`actual comparison restore rejects ${kind} members before extraction`, (t) => {
    const require = createRequire(import.meta.url);
    const { readWorkflow } = require('./workflow-yaml-test-helper.js');
    const step = readWorkflow('mail-calendar-tasks-builds.yaml').jobs[
      'calendar-artifact-restore'
    ].steps.find(
      (item) => item.name === 'Restore same-run cf comparison output'
    );
    const f = fixture(t);
    const download = join(f.directory, 'calendar-cf-output-download');
    mkdirSync(download);
    const archive = join(download, 'calendar-cf-output.tar.gz');
    const created = spawnSync(
      'python3',
      [
        '-c',
        `
import io, sys, tarfile
archive, kind, root = sys.argv[1:]
with tarfile.open(archive, 'w:gz') as output:
    name = root + '/absolute-member.txt' if kind == 'absolute' else '../escaped.txt' if kind == 'traversal' else 'unqualified-link'
    member = tarfile.TarInfo(name)
    if kind in ('symlink', 'hardlink'):
        member.type = tarfile.SYMTYPE if kind == 'symlink' else tarfile.LNKTYPE
        member.linkname = 'target'
        output.addfile(member)
    else:
        member.size = 7
        output.addfile(member, io.BytesIO(b'fixture'))
`,
        archive,
        kind,
        f.directory,
      ],
      { encoding: 'utf8' }
    );
    assert.ifError(created.error);
    assert.equal(created.status, 0, created.stderr);
    const result = spawnSync(
      'bash',
      ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', step.run],
      {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, RUNNER_TEMP: f.directory },
      }
    );
    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
    assert.equal(
      existsSync(join(f.directory, 'calendar-cf-output-restored')),
      false
    );
    assert.equal(existsSync(join(f.directory, 'escaped.txt')), false);
    assert.equal(existsSync(join(f.directory, 'absolute-member.txt')), false);
  });
}
