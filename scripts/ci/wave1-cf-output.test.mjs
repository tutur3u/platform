import assert from 'node:assert/strict';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { emitWave1Output } from './wave1-cf-output.mjs';
import { prepare } from './wave1-native-artifact.mjs';
import { rehearseWave1Publication } from './wave1-cf-publisher.mjs';

const require = createRequire(import.meta.url);
const { fixture } = require('./wave1-native-test-fixture.cjs');
const sha = 'd'.repeat(40);

test('multi-chunk Wave-1 emit passes cf Build Output inspection', async (t) => {
  const appRoot = fixture(t, 'mail');
  mkdirSync(join(appRoot, 'dist/server/chunks'), { recursive: true });
  mkdirSync(join(appRoot, 'dist/server/.vite'), { recursive: true });
  writeFileSync(
    join(appRoot, 'dist/server/chunks', 'mail-shared.js'),
    'export const mailShared = true;\n'
  );
  writeFileSync(
    join(appRoot, 'dist/server/.vite/manifest.json'),
    JSON.stringify({
      entry: {
        file: 'index.js',
        isEntry: true,
        imports: ['shared'],
      },
      shared: { file: 'chunks/mail-shared.js', imports: [] },
    })
  );
  writeFileSync(
    join(appRoot, 'dist/server/wrangler.json'),
    JSON.stringify({
      ...JSON.parse(
        readFileSync(join(appRoot, 'dist/server/wrangler.json'), 'utf8')
      ),
      rules: [{ type: 'ESModule', globs: ['**/*'] }],
    })
  );
  prepare(appRoot, 'mail', 'staging', 'cf-emit-fixture', sha);
  const parent = realpathSync(
    mkdtempSync(join(tmpdir(), 'wave1-cf-output-staging-'))
  );
  const destination = join(parent, 'build-output');
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  await emitWave1Output({
    appRoot,
    app: 'mail',
    environment: 'staging',
    sha,
    destination,
  });
  const worker = JSON.parse(
    readFileSync(
      join(
        destination,
        '.cloudflare/output/v0/workers/default/worker.config.json'
      ),
      'utf8'
    )
  );
  assert.equal(worker.observability?.headSamplingRate, 0.05);
  assert.equal(worker.observability?.head_sampling_rate, undefined);
  for (const name of Object.keys(worker.manifest.modules)) {
    assert.ok(
      /\.(?:m?js)$/u.test(name),
      `module name must reference a script file: ${name}`
    );
  }
  assert.deepEqual(Object.keys(worker.manifest.modules).sort(), [
    'chunks/mail-shared.js',
    'index.js',
  ]);
});

test('multi-chunk sealed output passes cf deploy prebuilt dry-run', async (t) => {
  const appRoot = fixture(t, 'mail');
  mkdirSync(join(appRoot, 'dist/server/chunks'), { recursive: true });
  mkdirSync(join(appRoot, 'dist/server/.vite'), { recursive: true });
  writeFileSync(
    join(appRoot, 'dist/server/chunks', 'mail-shared.js'),
    'export const mailShared = true;\n'
  );
  writeFileSync(
    join(appRoot, 'dist/server/.vite/manifest.json'),
    JSON.stringify({
      entry: {
        file: 'index.js',
        isEntry: true,
        imports: ['shared'],
      },
      shared: { file: 'chunks/mail-shared.js', imports: [] },
    })
  );
  writeFileSync(
    join(appRoot, 'dist/server/wrangler.json'),
    JSON.stringify({
      ...JSON.parse(
        readFileSync(join(appRoot, 'dist/server/wrangler.json'), 'utf8')
      ),
      rules: [{ type: 'ESModule', globs: ['**/*'] }],
    })
  );
  prepare(appRoot, 'mail', 'staging', 'cf-dry-run-fixture', sha);
  const env = {
    PATH: process.env.PATH,
    RUNNER_TEMP: mkdtempSync(join(tmpdir(), 'wave1-cf-runner-')),
  };
  t.after(() => rmSync(env.RUNNER_TEMP, { recursive: true, force: true }));
  env.HOME = env.RUNNER_TEMP;
  await rehearseWave1Publication({
    appRoot,
    app: 'mail',
    environment: 'staging',
    sha,
    configPath: join(appRoot, 'dist/wave1/wrangler.json'),
    env,
  });
});

test('hashed assets entry modules pass cf deploy prebuilt dry-run', async (t) => {
  const appRoot = fixture(t, 'apps');
  mkdirSync(join(appRoot, 'dist/server/assets'), { recursive: true });
  mkdirSync(join(appRoot, 'dist/server/.vite'), { recursive: true });
  writeFileSync(
    join(appRoot, 'dist/server/assets', 'index-abc12345.js'),
    'export default { fetch() { return new Response("apps"); } };\n'
  );
  writeFileSync(
    join(appRoot, 'dist/server/assets', 'chunk-xyz98765.js'),
    'export const shared = true;\n'
  );
  writeFileSync(
    join(appRoot, 'dist/server/.vite/manifest.json'),
    JSON.stringify({
      entry: {
        file: 'assets/index-abc12345.js',
        isEntry: true,
        imports: ['chunk'],
      },
      chunk: { file: 'assets/chunk-xyz98765.js', imports: [] },
    })
  );
  writeFileSync(
    join(appRoot, 'dist/server/wrangler.json'),
    JSON.stringify({
      ...JSON.parse(
        readFileSync(join(appRoot, 'dist/server/wrangler.json'), 'utf8')
      ),
      main: './assets/index-abc12345.js',
      rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
    })
  );
  prepare(appRoot, 'apps', 'production', 'tuturuuu-e89', sha);
  const env = {
    PATH: process.env.PATH,
    RUNNER_TEMP: mkdtempSync(join(tmpdir(), 'wave1-cf-apps-entry-')),
  };
  t.after(() => rmSync(env.RUNNER_TEMP, { recursive: true, force: true }));
  env.HOME = env.RUNNER_TEMP;
  const parent = realpathSync(
    mkdtempSync(join(tmpdir(), 'wave1-cf-apps-emit-'))
  );
  const destination = join(parent, 'build-output');
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  await emitWave1Output({
    appRoot,
    app: 'apps',
    environment: 'production',
    sha,
    destination,
  });
  const worker = JSON.parse(
    readFileSync(
      join(
        destination,
        '.cloudflare/output/v0/workers/default/worker.config.json'
      ),
      'utf8'
    )
  );
  assert.equal(worker.manifest.mainModule, 'assets/index-abc12345.js');
  assert.deepEqual(Object.keys(worker.manifest.modules).sort(), [
    'assets/chunk-xyz98765.js',
    'assets/index-abc12345.js',
  ]);
  await rehearseWave1Publication({
    appRoot,
    app: 'apps',
    environment: 'production',
    sha,
    configPath: join(appRoot, 'dist/wave1/wrangler.json'),
    env,
  });
});
