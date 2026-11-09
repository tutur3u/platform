import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { readWorkflow } = require('./workflow-yaml-test-helper.js');
const command = readWorkflow('learn-cloudflare.yaml').jobs.build.steps.find(
  (step) => step.name === 'Package deployable Worker, config and assets'
).run;
const native = '.wrangler/deploy/config.json';
const saved = '.void/preview-deploy-config.json';
const source = 'a'.repeat(40);

function fixture(
  t,
  pointers = [saved],
  configPath = '../../dist/server/config.json'
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'learn-package-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = join(root, 'apps/learn');
  for (const dir of ['dist/client', 'dist/server'])
    mkdirSync(join(app, dir), { recursive: true });
  writeFileSync(join(app, 'dist/client/app.js'), 'export default {};');
  writeFileSync(join(app, 'dist/server/config.json'), '{"name":"fixture"}');
  mkdirSync(join(root, 'scripts/ci'), { recursive: true });
  for (const file of ['ci/apps-native-runtime-pointer.mjs', 'safe-fs.js']) {
    copyFileSync(
      fileURLToPath(new URL(`../${file}`, import.meta.url)),
      join(root, 'scripts', file)
    );
  }
  for (const pointer of pointers) {
    mkdirSync(dirname(join(app, pointer)), { recursive: true });
    writeFileSync(
      join(app, pointer),
      JSON.stringify({ configPath, auxiliaryWorkers: [] })
    );
  }
  const output = join(root, 'output');
  mkdirSync(output);
  return { root, output };
}

function run({ root, output }) {
  return spawnSync('bash', ['-e', '-c', command], {
    cwd: root,
    env: { ...process.env, SOURCE_SHA: source, RUNNER_TEMP: output },
    encoding: 'utf8',
  });
}

for (const pointer of [native, saved]) {
  test(`packages the validated ${pointer} with its emitted files`, (t) => {
    const setup = fixture(t, [pointer]);
    const result = run(setup);
    assert.equal(result.status, 0, result.stderr);
    const archive = join(setup.output, 'learn-cloudflare.tar.gz');
    const entries = execFileSync('tar', ['-tzf', archive], {
      encoding: 'utf8',
    }).split('\n');
    assert.ok(entries.includes(pointer));
    assert.ok(entries.includes('dist/client/app.js'));
    assert.ok(entries.includes('dist/server/config.json'));
    assert.equal(
      readFileSync(join(setup.root, 'apps/learn/dist/SOURCE_SHA'), 'utf8'),
      `${source}\n`
    );
  });
}

for (const pointers of [[], [native, saved]]) {
  test(`refuses ${pointers.length} deploy pointers`, (t) => {
    const result = run(fixture(t, pointers));
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /Exactly one native\/saved deploy pointer required/
    );
  });
}

test('refuses a pointer escaping the emitted output', (t) => {
  const result = run(fixture(t, [saved], '../../../outside.json'));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Path escaped artifact root/);
});
