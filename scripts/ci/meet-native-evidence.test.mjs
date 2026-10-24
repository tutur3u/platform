// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub expressions are tested as literal workflow values.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { readFileSnapshot } from '../safe-fs.js';

const { readWorkflow } = createRequire(import.meta.url)(
  './workflow-yaml-test-helper.js'
);
const workflow = readWorkflow('meet-cloudflare.yaml');

async function inventory(root) {
  const result = [];
  async function visit(path, name) {
    let info = await lstat(path);
    let bytes;
    if (info.isFile())
      ({ data: bytes, stat: info } = await readFileSnapshot(path));
    const entry = {
      name,
      mode: info.mode & 0o7777,
      mtimeSeconds: Math.floor(info.mtimeMs / 1000),
    };
    if (info.isSymbolicLink()) {
      entry.type = 'link';
      entry.target = await readlink(path);
    } else if (info.isDirectory()) {
      entry.type = 'directory';
    } else {
      assert.ok(info.isFile());
      entry.type = 'file';
      entry.hash = createHash('sha256').update(bytes).digest('hex');
    }
    result.push(entry);
    if (info.isDirectory())
      for (const child of (await readdir(path)).sort())
        await visit(join(path, child), `${name}/${child}`);
  }
  for (const name of (await readdir(root)).sort())
    await visit(join(root, name), name);
  return result;
}

for (const [job, suffix] of [
  ['validate', 'finite Meet graph evidence'],
  ['deploy', 'restored finite Meet graph evidence'],
]) {
  test(`${job} selected evidence packaging retains hidden SDK snapshot bytes and metadata`, async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'meet-evidence-pack-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const steps = workflow.jobs[job].steps;
    const packIndex = steps.findIndex((step) => step.name === `Pack ${suffix}`);
    assert.ok(packIndex >= 0);
    const pack = steps[packIndex],
      upload = steps[packIndex + 1];
    assert.equal(upload.name, `Retain ${suffix}`);
    assert.equal(pack.if, 'always()');
    assert.equal(upload.if, 'always()');
    assert.equal(pack['working-directory'], '${{ runner.temp }}');
    assert.equal(
      upload.with.path,
      '${{ runner.temp }}/meet-native-evidence.tar.gz'
    );
    assert.equal(upload.with['retention-days'], 7);
    assert.notEqual(upload.with['include-hidden-files'], true);
    assert.notEqual(pack['continue-on-error'], true);
    assert.notEqual(upload['continue-on-error'], true);
    const source = join(root, 'source'),
      runner = join(root, 'runner');
    await mkdir(source);
    await mkdir(runner);
    for (const name of ['meet-native-run-one', 'meet-native-run-two']) {
      const base = join(source, name);
      const sdk = join(
        base,
        'diagnostics/snapshot-one/case/native-sdk-temp/meet-graph-one/app/ssr/.wrangler'
      );
      await mkdir(join(sdk, 'tmp/empty'), { recursive: true, mode: 0o700 });
      await writeFile(
        join(sdk, 'tmp/entry.mjs'),
        Buffer.from([0, 255, 10, 42]),
        { mode: 0o640 }
      );
      await writeFile(join(sdk, '.sdk-state'), 'hidden SDK state', {
        mode: 0o600,
      });
      await symlink('tmp/entry.mjs', join(sdk, 'entry-link'));
      await writeFile(
        join(base, 'diagnostics/snapshot-one/pre-removal.json'),
        '{"version":1,"private":true}',
        { mode: 0o600 }
      );
      await chmod(base, 0o700);
    }
    const expected = await inventory(source);
    // Populate the runner as the launcher would, preserving fixture modes/links.
    execFileSync('cp', ['-pR', `${source}/.`, runner]);
    await mkdir(join(runner, 'foreign-workspace'));
    await writeFile(
      join(runner, 'foreign-workspace/.env'),
      'unselected sentinel'
    );
    const archive = upload.with.path.replace('${{ runner.temp }}', runner);
    async function packAndExtract(command, destination) {
      execFileSync('bash', ['-eu', '-c', command], {
        cwd: runner,
        env: { ...process.env, RUNNER_TEMP: runner },
      });
      await mkdir(destination);
      execFileSync('tar', ['-xzf', archive, '-C', destination]);
    }
    const extracted = join(root, 'extracted');
    await packAndExtract(pack.run, extracted);
    assert.deepEqual(await inventory(extracted), expected);
    assert.equal(dirname(archive), runner);
    assert.ok(
      !archive.split('/').at(-1).startsWith('.'),
      'Upload selects one visible archive'
    );
    assert.ok(
      !execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).includes(
        'foreign-workspace'
      )
    );
    const negative = pack.run.replace(
      'tar -czf',
      "tar --exclude='*/.wrangler' -czf"
    );
    assert.notEqual(
      negative,
      pack.run,
      'Hidden omission control must change the selected packaging command'
    );
    const omitted = join(root, 'omitted');
    await packAndExtract(negative, omitted);
    const actual = await inventory(omitted);
    assert.ok(!actual.some((entry) => entry.name.includes('/.wrangler')));
    assert.throws(
      () => assert.deepEqual(actual, expected),
      assert.AssertionError,
      'Hidden omission must fail complete inventory acceptance'
    );
  });
}
