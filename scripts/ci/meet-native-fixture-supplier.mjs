import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  chmod, mkdir, mkdtemp, realpath, writeFile,
} from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closed, hash, inspectMeetGraph } from './meet-native-profile.mjs';
import { observeOwnedChild } from './native-wrangler-observable.mjs';
import { readFileSnapshot } from '../safe-fs.js';
import { admitMeetProductionInputs, createMeetProductionInputs, PRODUCTION_PROFILE } from './meet-native-inventory.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const fixtureInputs = Object.freeze({
  NEXT_PUBLIC_SUPABASE_URL: 'https://meet-ci.supabase.invalid',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_meet_ci_placeholder',
  NEXT_PUBLIC_APP_URL: 'https://meet.tuturuuu.com',
  NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.com',
});

function git(args) {
  return execFileSync('git', args, {
    cwd: repository,
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function committedIdentity(sourceSHA) {
  assert.match(sourceSHA, /^[a-f0-9]{40}$/);
  assert.equal(git(['rev-parse', 'HEAD']).toString().trim(), sourceSHA);
  return {
    sourceSHA,
    sourceTree: git(['rev-parse', `${sourceSHA}^{tree}`]).toString().trim(),
    ownerPackageHash: hash(git(['show', `${sourceSHA}:apps/meet/package.json`])),
    lockHash: hash(git(['show', `${sourceSHA}:bun.lock`])),
  };
}

function fixtureEnvironment(home, sourceSHA) {
  const result = {};
  for (const name of ['PATH', 'SystemRoot', 'WINDIR', 'RUNNER_TRACKING_ID'])
    if (process.env[name]) result[name] = process.env[name];
  return {
    ...result,
    ...fixtureInputs,
    HOME: home,
    XDG_CONFIG_HOME: home,
    XDG_CACHE_HOME: join(home, 'cache'),
    BUN_INSTALL_CACHE_DIR: join(home, 'bun-cache'),
    CI: 'true',
    GITHUB_SHA: sourceSHA,
    GITHUB_REF: 'refs/heads/ci-fixture',
    PLATFORM_BUILD_COMMIT_HASH: sourceSHA,
    PLATFORM_BUILD_REF_NAME: 'ci-fixture',
    PLATFORM_BUILD_ENVIRONMENT: 'preview',
    WRANGLER_SEND_METRICS: 'false',
  };
}

async function hashFile(path) {
  const digest = createHash('sha256');
  for await (const bytes of createReadStream(path)) digest.update(bytes);
  return digest.digest('hex');
}

async function run(program, args, cwd, env, timeout) {
  assert.notEqual(process.platform, 'win32', 'Fixture producer requires POSIX process groups');
  const child = spawn(program, args, {
    cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let expired = false;
  let interrupted = false;
  let signalError;
  let escalation;
  const signal = (name) => {
    if (!child.pid) return;
    try { process.kill(-child.pid, name); }
    catch (error) { if (error.code !== 'ESRCH') signalError ??= error; }
  };
  const stop = () => {
    signal('SIGTERM');
    escalation ??= setTimeout(() => signal('SIGKILL'), 2_000);
  };
  const cancel = () => { interrupted = true; stop(); };
  process.on('SIGTERM', cancel);
  process.on('SIGINT', cancel);
  const deadline = setTimeout(() => { expired = true; stop(); }, timeout);
  let outcome;
  try {
    outcome = await observeOwnedChild(child, (stream, bytes) => {
      process[stream].write(bytes);
    });
  } finally {
    clearTimeout(deadline);
    clearTimeout(escalation);
    process.off('SIGTERM', cancel);
    process.off('SIGINT', cancel);
    if (expired || interrupted) signal('SIGKILL');
  }
  let residual = false;
  if (child.pid) {
    try { process.kill(-child.pid, 0); residual = true; }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  if (residual) signal('SIGKILL');
  const facts = { exitCode: outcome.code, signal: outcome.signal,
    closeObserved: outcome.closeObserved, stdioDrained: outcome.stdioDrained,
    timedOut: expired, cancelled: interrupted, residualGroup: residual };
  const failure = signalError ? 'Fixture owned-group signal failed'
    : interrupted ? 'Fixture stage cancelled'
    : expired ? 'Fixture stage deadline exceeded'
    : residual ? 'Fixture stage process group remains'
    : outcome.error ? 'Fixture stage spawn or stream failed'
    : outcome.code !== 0 ? 'Fixture stage failed'
    : outcome.signal !== null ? 'Fixture stage signalled'
    : !outcome.closeObserved || !outcome.stdioDrained ? 'Fixture stage closure incomplete'
    : null;
  if (failure) {
    const error = new Error(failure);
    error.status = outcome.code;
    error.signal = outcome.signal;
    error.facts = facts;
    throw error;
  }
  return facts;
}

export { run as runFixtureStage };

const fixtureLayout = Object.freeze({
  app: 'source/apps/meet', owner: 'source/apps/meet/package.json', lock: 'source/bun.lock',
});
export function portableMeetGraph(plan) {
  const { app, root, ownerPackage, lockPath, manifestPath, pointerPath, probePath,
    ...identity } = plan;
  return JSON.parse(JSON.stringify(identity));
}
export function admitMeetFixtureEnvelope(receipt, identity) {
  closed(receipt, ['schema', 'purpose', 'identity', 'sourceArchiveHash', 'layout',
    'producer', 'graph'], 'Closed Meet fixture receipt');
  assert.equal(receipt.schema, 2);
  assert.equal(receipt.purpose, 'fixture-validation-only');
  assert.deepEqual(receipt.identity, identity);
  assert.deepEqual(receipt.layout, fixtureLayout);
  assert.match(receipt.sourceArchiveHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(receipt.producer, {
    dependencyInstall: 'bun install --frozen-lockfile',
    dependencies: 'bun turbo:local run build --filter=@tuturuuu/meet-core^... --concurrency=2',
    frontend: 'bun run build:cloudflare', environment: fixtureInputs,
  });
  assert.equal(receipt.graph?.profile, 'meet-emitted-v1');
  assert.equal(receipt.graph?.sourceSHA, identity.sourceSHA);
}
export function admitMeetFixtureReceipt(receipt, { identity, root, archiveHash }, plan) {
  admitMeetFixtureEnvelope(receipt, identity);
  assert.equal(archiveHash, receipt.sourceArchiveHash);
  assert.equal(plan.profile, 'meet-emitted-v1');
  assert.equal(plan.admission, undefined);
  assert.equal(plan.sourceSHA, identity.sourceSHA);
  assert.equal(plan.app, join(root, fixtureLayout.app));
  assert.equal(plan.ownerPackage, join(root, fixtureLayout.owner));
  assert.equal(plan.lockPath, join(root, fixtureLayout.lock));
  assert.equal(plan.ownerPackageHash, identity.ownerPackageHash);
  assert.equal(plan.lockHash, identity.lockHash);
  assert.deepEqual(portableMeetGraph(plan), receipt.graph);
}
async function readReceipt(path) {
  assert.equal(await realpath(path), path);
  const { data } = await readFileSnapshot(path, { maxBytes: 8 * 1024 * 1024 });
  return JSON.parse(data.toString('utf8'));
}
export async function readMeetFixtureReceipt(sourceSHA, receiptPath) {
  const identity = committedIdentity(sourceSHA);
  const receipt = await readReceipt(receiptPath);
  admitMeetFixtureEnvelope(receipt, identity);
  const root = await realpath(dirname(receiptPath));
  const archiveHash = await hashFile(join(root, 'source.tar'));
  const appDirectory = join(root, fixtureLayout.app);
  const plan = await inspectMeetGraph({ sourceSHA, appDirectory,
    ownerPackage: join(root, fixtureLayout.owner) });
  admitMeetFixtureReceipt(receipt, { identity, root, archiveHash }, plan);
  return plan;
}
export async function writeMeetProductionInputs(sourceSHA, destination, env) {
  assert.equal(env.GITHUB_REF, 'refs/heads/production', 'Production producer ref required');
  const identity = committedIdentity(sourceSHA);
  const proof = createMeetProductionInputs(identity, {
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
  });
  await writeFile(destination, JSON.stringify(proof), { flag: 'wx', mode: 0o600 });
}
export async function writeMeetProductionReceipt(sourceSHA, proofPath, destination) {
  const identity = committedIdentity(sourceSHA);
  const proof = await readReceipt(proofPath);
  admitMeetProductionInputs(proof, identity);
  const appDirectory = await realpath(join(repository, 'apps/meet'));
  const graph = await inspectMeetGraph({ sourceSHA, appDirectory,
    ownerPackage: join(appDirectory, 'package.json'),
    admission: { profile: PRODUCTION_PROFILE, productionProof: proof } });
  await writeFile(destination, JSON.stringify({ schema: 1,
    purpose: 'production-emitted-runtime', identity, productionProof: proof,
    graph: portableMeetGraph(graph) }), { flag: 'wx', mode: 0o600 });
}
export async function readMeetProductionReceipt(sourceSHA, receiptPath) {
  const identity = committedIdentity(sourceSHA);
  const receipt = await readReceipt(receiptPath);
  closed(receipt, ['schema', 'purpose', 'identity', 'productionProof', 'graph'],
    'Closed production receipt');
  assert.equal(receipt.schema, 1);
  assert.equal(receipt.purpose, 'production-emitted-runtime');
  assert.deepEqual(receipt.identity, identity);
  admitMeetProductionInputs(receipt.productionProof, identity);
  const appDirectory = await realpath(join(repository, 'apps/meet'));
  const plan = await inspectMeetGraph({ sourceSHA, appDirectory,
    ownerPackage: join(appDirectory, 'package.json'),
    admission: { profile: PRODUCTION_PROFILE, productionProof: receipt.productionProof } });
  assert.deepEqual(portableMeetGraph(plan), receipt.graph);
  return plan;
}

export async function supplyMeetFixture(sourceSHA, parent) {
  const identity = committedIdentity(sourceSHA);
  assert.equal(await realpath(parent), parent);
  assert.doesNotMatch(parent, /[\r\n]/);
  const root = await mkdtemp(join(parent, 'meet-fixture-supplier-'));
  await chmod(root, 0o700);
  if (process.env.GITHUB_OUTPUT)
    await writeFile(process.env.GITHUB_OUTPUT, `root=${root}\n`, { flag: 'a' });
  const journal = join(root, 'journal.json');
  await writeFile(journal, JSON.stringify({ sourceSHA, phase: 'archive', status: 'started' }),
    { flag: 'wx', mode: 0o600 });
  const source = join(root, 'source');
  const home = join(root, 'home');
  await mkdir(source, { mode: 0o700 });
  await mkdir(home, { mode: 0o700 });
  const archive = join(root, 'source.tar');
  git(['archive', '--format=tar', `--output=${archive}`, sourceSHA]);
  await chmod(archive, 0o600);
  const sourceArchiveHash = await hashFile(archive);
  const env = fixtureEnvironment(home, sourceSHA);
  const appDirectory = join(source, 'apps/meet');
  const stages = [
    ['extract', 'tar', ['-xf', archive, '-C', source], root, 60_000],
    ['install', 'bun', ['install', '--frozen-lockfile'], source, 300_000],
    ['metadata', 'bun', ['run', '--silent', 'scripts/ci/generate-build-metadata.ts'], source, 60_000],
    ['dependencies', 'bun', ['turbo:local', 'run', 'build',
      '--filter=@tuturuuu/meet-core^...', '--concurrency=2'], source, 480_000],
    ['frontend', 'bun', ['run', 'build:cloudflare'], appDirectory, 300_000],
    ['seal', process.execPath, ['scripts/ci/verify-meet-start-output.js', 'seal',
      'apps/meet', 'apps/meet/meet-artifact.json'], source, 60_000],
  ];
  for (const [phase, program, args, cwd, timeout] of stages) {
    await writeFile(journal, JSON.stringify({ sourceSHA, phase, status: 'started' }));
    try {
      const facts = await run(program, args, cwd, env, timeout);
      await writeFile(journal, JSON.stringify({ sourceSHA, phase, status: 'completed', facts }));
    } catch (error) {
      await writeFile(journal, JSON.stringify({ sourceSHA, phase, status: 'failed',
        exitCode: error.status ?? null, signal: error.signal ?? null, facts: error.facts ?? null }));
      throw error;
    }
  }
  await writeFile(journal, JSON.stringify({ sourceSHA, phase: 'admission', status: 'started' }));
  const ownerPackage = join(appDirectory, 'package.json');
  const graph = await inspectMeetGraph({ sourceSHA, appDirectory, ownerPackage });
  assert.equal(graph.ownerPackageHash, identity.ownerPackageHash);
  assert.equal(graph.lockHash, identity.lockHash);
  const receiptPath = join(root, 'receipt.json');
  await writeFile(receiptPath, JSON.stringify({
    schema: 2,
    purpose: 'fixture-validation-only',
    identity,
    sourceArchiveHash,
    layout: fixtureLayout,
    producer: {
      dependencyInstall: 'bun install --frozen-lockfile',
      dependencies: "bun turbo:local run build --filter=@tuturuuu/meet-core^... --concurrency=2",
      frontend: 'bun run build:cloudflare',
      environment: fixtureInputs,
    },
    graph: portableMeetGraph(graph),
  }), { flag: 'wx', mode: 0o600 });
  await readMeetFixtureReceipt(sourceSHA, receiptPath);
  await writeFile(journal, JSON.stringify({ sourceSHA, phase: 'admission', status: 'completed' }));
  const pointer = relative(appDirectory, graph.pointerPath);
  await run('tar', ['-czf', join(root, 'artifact.tar.gz'), '-C', appDirectory,
    'dist', pointer, 'meet-artifact.json'], root, env, 60_000);
  const transport = join(root, 'fixture-transport.tar.gz');
  await run('tar', ['-czf', transport, '-C', root, 'source.tar', 'receipt.json',
    'artifact.tar.gz'], root, env, 60_000);
  if (process.env.GITHUB_OUTPUT)
    await writeFile(process.env.GITHUB_OUTPUT, `transport=${transport}\n`, { flag: 'a' });
  return receiptPath;
}

export function admitFixtureArchiveListing(names, types, transport = false) {
  assert.ok(names.length > 0 && names.length <= 30000);
  assert.equal(names.length, types.length);
  assert.equal(new Set(names).size, names.length);
  for (const [index, name] of names.entries()) {
    assert.match(name, /^[a-zA-Z0-9_.@%+/-]+$/);
    assert.ok(!name.startsWith('/') && !name.split('/').includes('..'));
    assert.ok(['-', 'd'].includes(types[index]), 'Fixture links/special entries forbidden');
    if (transport) {
      assert.ok(['source.tar', 'receipt.json', 'artifact.tar.gz'].includes(name));
      assert.equal(types[index], '-');
    } else assert.ok(name === 'meet-artifact.json' || name === 'dist/' ||
      name.startsWith('dist/') || name === '.wrangler/deploy/config.json' ||
      name === '.void/preview-deploy-config.json', 'Unknown fixture archive member');
  }
  if (transport) assert.equal(names.length, 3);
}
async function extractArtifact(archive, target, env, transport) {
  const options = { env, timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  const names = execFileSync('tar', ['-tzf', archive], options).trimEnd().split('\n');
  const types = execFileSync('tar', ['-tvzf', archive], options).trimEnd().split('\n')
    .map((line) => line[0]);
  admitFixtureArchiveListing(names, types, transport);
  await run('tar', ['-xzf', archive, '-C', target], target, env, 60_000);
}
export async function restoreMeetFixture(sourceSHA, transport, parent) {
  const identity = committedIdentity(sourceSHA);
  assert.equal(await realpath(parent), parent);
  const root = await mkdtemp(join(parent, 'meet-fixture-restore-'));
  await chmod(root, 0o700);
  const home = join(root, 'home');
  await mkdir(home, { mode: 0o700 });
  const env = fixtureEnvironment(home, sourceSHA);
  await extractArtifact(transport, root, env, true);
  const receipt = await readReceipt(join(root, 'receipt.json'));
  admitMeetFixtureEnvelope(receipt, identity);
  const trustedArchive = join(root, 'committed-source.tar');
  git(['archive', '--format=tar', `--output=${trustedArchive}`, sourceSHA]);
  assert.equal(await hashFile(trustedArchive), receipt.sourceArchiveHash);
  assert.equal(await hashFile(join(root, 'source.tar')), receipt.sourceArchiveHash);
  const source = join(root, 'source');
  await mkdir(source, { mode: 0o700 });
  await run('tar', ['-xf', trustedArchive, '-C', source], root, env, 60_000);
  const appDirectory = join(root, fixtureLayout.app);
  await extractArtifact(join(root, 'artifact.tar.gz'), appDirectory, env, false);
  const receiptPath = join(root, 'receipt.json');
  await readMeetFixtureReceipt(sourceSHA, receiptPath);
  await run('bun', ['install', '--frozen-lockfile'], source, env, 300_000);
  await readMeetFixtureReceipt(sourceSHA, receiptPath);
  return receiptPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === 'inputs') {
    assert.equal(args.length, 3);
    await writeMeetProductionInputs(args[1], args[2], process.env);
  } else if (args[0] === 'production-receipt') {
    assert.equal(args.length, 4);
    await writeMeetProductionReceipt(args[1], args[2], args[3]);
  } else {
    const restore = args[0] === 'restore';
    assert.equal(args.length, restore ? 4 : 2);
    const receipt = restore
      ? await restoreMeetFixture(args[1], args[2], args[3])
      : await supplyMeetFixture(args[0], args[1]);
    assert.ok(process.env.GITHUB_OUTPUT);
    await writeFile(process.env.GITHUB_OUTPUT, `receipt=${receipt}\n`, { flag: 'a' });
  }
}
