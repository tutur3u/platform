import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { lstat, readdir, realpath, rmdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sealMeetApp } from './meet-native-inventory.mjs';

const { validateOutput } = createRequire(import.meta.url)(
  './verify-meet-start-output.js'
);

async function optionalStat(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function canonicalDirectory(path) {
  const stat = await lstat(path);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  assert.equal(await realpath(path), path);
  return stat;
}

function sameDirectory(actual, expected) {
  assert.ok(actual.isDirectory() && !actual.isSymbolicLink());
  assert.equal(actual.dev, expected.dev);
  assert.equal(actual.ino, expected.ino);
}

async function dryRun(configPath, app) {
  // Keep the existing app-owned Bun/Wrangler resolution, arguments and environment.
  const child = spawn(
    'bun',
    ['x', '--no-install', 'wrangler', 'deploy', '--dry-run', '-c', configPath],
    { cwd: app, env: process.env, stdio: 'inherit' }
  );
  let spawnError;
  child.on('error', (error) => {
    spawnError = error;
  });
  return await new Promise((resolve) => {
    // close follows exit and closure of child stdio; never clean up on exit alone.
    child.once('close', (code, signal) => {
      resolve({ code, signal, spawnError });
    });
  });
}

async function verifyLayout(root, seal, scratch, tmp) {
  const expected = new Set(Object.keys(seal));
  expected.add(`${relative(root, scratch)}/`);
  expected.add(`${relative(root, tmp)}/`);
  async function visit(directory) {
    await canonicalDirectory(directory);
    for (const name of await readdir(directory)) {
      const path = join(directory, name);
      const stat = await lstat(path);
      assert.ok(stat.isDirectory() || stat.isFile());
      assert.equal(await realpath(path), path);
      const key = `${relative(root, path)}${stat.isDirectory() ? '/' : ''}`;
      assert.ok(expected.delete(key), 'Unexpected post-dry-run artifact entry');
      if (stat.isDirectory()) await visit(path);
    }
  }
  await visit(root);
  assert.equal(expected.size, 0, 'Incomplete post-dry-run artifact layout');
}

async function main() {
  assert.equal(process.argv.length, 3);
  const sourceSHA = process.argv[2];
  assert.match(sourceSHA, /^[a-f0-9]{40}$/);
  const app = fileURLToPath(new URL('../../apps/meet', import.meta.url));
  const appStat = await canonicalDirectory(app);
  assert.equal(await realpath(process.cwd()), app, 'Meet cwd required');
  const root = join(app, 'dist');
  const rootStat = await canonicalDirectory(root);
  const artifact = validateOutput(app, {
    sha: sourceSHA,
    mode: 'restore-required',
  });
  const configParent = dirname(artifact.configPath);
  const parentStat = await canonicalDirectory(configParent);
  const options = {
    configRelative: relative(root, artifact.configPath),
    assetsRelative: relative(root, artifact.assets),
  };
  const seal = await sealMeetApp(root, options);
  const scratch = join(configParent, '.wrangler');
  const tmp = join(scratch, 'tmp');
  // Capture preabsence before invoking Wrangler, including dangling links.
  assert.equal(await optionalStat(scratch), undefined, 'Preexisting scratch');
  assert.equal(await optionalStat(tmp), undefined, 'Preexisting scratch tmp');

  const outcome = await dryRun(artifact.configPath, app);
  if (outcome.spawnError || outcome.signal || outcome.code !== 0) {
    // Preserve residue on every command failure, including spawn and signal failure.
    if (outcome.signal) process.kill(process.pid, outcome.signal);
    else process.exitCode = outcome.code ?? 1;
    if (outcome.spawnError) process.stderr.write('meet_dry_run:spawn_failed\n');
    return;
  }

  sameDirectory(await canonicalDirectory(app), appStat);
  sameDirectory(await canonicalDirectory(root), rootStat);
  sameDirectory(await canonicalDirectory(configParent), parentStat);
  const scratchStat = await optionalStat(scratch);
  if (scratchStat) {
    const ownedScratch = await canonicalDirectory(scratch);
    const ownedTmp = await canonicalDirectory(tmp);
    assert.deepEqual(await readdir(scratch), ['tmp']);
    assert.deepEqual(await readdir(tmp), []);
    validateOutput(app, { sha: sourceSHA, mode: 'restore-required' });
    await verifyLayout(root, seal, scratch, tmp);
    // Recheck identity and emptiness before each nonrecursive removal.
    sameDirectory(await canonicalDirectory(configParent), parentStat);
    sameDirectory(await canonicalDirectory(scratch), ownedScratch);
    sameDirectory(await canonicalDirectory(tmp), ownedTmp);
    assert.deepEqual(await readdir(scratch), ['tmp']);
    assert.deepEqual(await readdir(tmp), []);
    await rmdir(tmp);
    sameDirectory(await canonicalDirectory(configParent), parentStat);
    sameDirectory(await canonicalDirectory(scratch), ownedScratch);
    assert.deepEqual(await readdir(scratch), []);
    await rmdir(scratch);
  } else {
    assert.equal(await optionalStat(tmp), undefined);
  }
  validateOutput(app, { sha: sourceSHA, mode: 'restore-required' });
  assert.deepEqual(await sealMeetApp(root, options), seal);
}

try {
  await main();
} catch {
  process.stderr.write('meet_dry_run:rejected\n');
  process.exitCode = 1;
}
