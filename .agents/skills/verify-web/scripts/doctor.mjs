import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PORT,
  LANDMARK,
  READY_TIMEOUT_MS,
  buildChildEnv,
  fetchLandmark,
  findRepoRoot,
  hasProductionBuild,
  isOwnedProcess,
  killOwned,
  listenerPid,
  ownsPid,
  portOpen,
  processSnapshot,
  readState,
  resolveNextBin,
  skillPaths,
  writeState,
} from './lib.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = findRepoRoot(scriptDir);
const paths = skillPaths(root);
const restart = process.argv.includes('--restart');
const requestedMode = process.env.VERIFY_WEB_MODE === 'start' ? 'start' : process.env.VERIFY_WEB_MODE === 'dev' ? 'dev' : null;
const port = Number.parseInt(process.env.VERIFY_WEB_PORT ?? String(DEFAULT_PORT), 10);

function requirePackageDists() {
  const missing = ['types', 'supabase', 'internal-api'].filter(
    (pkg) => !fs.existsSync(path.join(root, 'packages', pkg, 'dist/index.js'))
  );
  if (missing.length === 0) return;
  fail(
    `missing dist for ${missing.map((pkg) => `@tuturuuu/${pkg}`).join(', ')}. From the repo root, run \`cd packages/<name> && bun run build\` for types, supabase, and internal-api. Do not run bun setup or next build.`,
    { missing: missing.join(',') }
  );
}

function fail(message, details = {}) {
  console.error(`verify-web doctor: FAIL`);
  console.error(message);
  for (const [key, value] of Object.entries(details)) {
    console.error(`${key}: ${value}`);
  }
  process.exit(1);
}

function report(result, state) {
  console.log(`verify-web doctor: ${result.found ? 'PASS' : 'FAIL'}`);
  console.log(`url: ${result.url}`);
  console.log(`status: ${result.status}`);
  console.log(`landmark: ${result.found ? LANDMARK : 'missing'}`);
  console.log(`heading: ${result.heading || '(none)'}`);
  console.log(`mode: ${state.mode}`);
  console.log(`pid: ${state.pid}`);
  console.log(`port: ${state.port}`);
  if (!result.found) process.exit(1);
}

async function waitForReady(baseUrl, pid) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    if (!processSnapshot(pid)) {
      fail('the server process exited before the landmark rendered', {
        log: paths.logPath,
      });
    }
    if (await portOpen(port)) {
      try {
        last = await fetchLandmark(baseUrl);
        if (last.found || last.status === 200) return last;
      } catch (error) {
        last = {
          url: new URL('/en', baseUrl).href,
          status: 0,
          found: false,
          heading: error instanceof Error ? error.message : 'request failed',
        };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return (
    last ?? {
      url: new URL('/en', baseUrl).href,
      status: 0,
      found: false,
      heading: '(timeout)',
    }
  );
}

function startServer(mode) {
  const nextBin = resolveNextBin(root, paths.webDir);
  fs.mkdirSync(paths.stateDir, { recursive: true });
  const logFd = fs.openSync(paths.logPath, 'a');
  fs.writeSync(logFd, `\n--- verify-web ${mode} ${new Date().toISOString()} port ${port} ---\n`);
  const args = mode === 'start' ? ['start', '-p', String(port)] : ['dev', '-p', String(port), '--turbopack'];
  const child = spawn(process.execPath, [nextBin, ...args], {
    cwd: paths.webDir,
    env: buildChildEnv(root, port),
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  fs.closeSync(logFd);
  if (!child.pid) fail('failed to spawn next');
  let snapshot = null;
  for (let attempt = 0; attempt < 20 && !snapshot; attempt += 1) {
    snapshot = processSnapshot(child.pid);
    if (!snapshot) spawnSync('sleep', ['0.05']);
  }
  const state = {
    pid: child.pid,
    port,
    mode,
    nextBin,
    lstart: snapshot?.lstart ?? '',
    baseUrl: `http://127.0.0.1:${port}`,
    startedAt: new Date().toISOString(),
  };
  writeState(paths.statePath, state);
  return state;
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  fail(`VERIFY_WEB_PORT is not a TCP port: ${process.env.VERIFY_WEB_PORT}`);
}

requirePackageDists();

let state = readState(paths.statePath);
if (restart && state) {
  const result = killOwned(state);
  if (!result.killed && processSnapshot(state.pid)) {
    fail('refusing to restart because the recorded process is not the server this skill started', {
      pid: state.pid,
      reason: result.reason,
    });
  }
  fs.rmSync(paths.statePath, { force: true });
  state = null;
}

const owned =
  state && isOwnedProcess(state, processSnapshot(state.pid)) ? state : null;
if (state && !owned) {
  fs.rmSync(paths.statePath, { force: true });
}

const occupant = listenerPid(port);
if (occupant && !(owned && ownsPid(owned.pid, occupant))) {
  fail(`port ${port} is already in use by pid ${occupant}. This skill will not stop a process it did not start.`, {
    hint: 'Leave that server alone. Set VERIFY_WEB_PORT to a free port for a curl-only doctor. Playwright drive stays on port 7803 or https://tuturuuu.localhost.',
  });
}

let mode = requestedMode;
if (!mode) {
  mode = hasProductionBuild(paths.webDir) ? 'start' : 'dev';
}
if (mode === 'start' && !hasProductionBuild(paths.webDir)) {
  fail('VERIFY_WEB_MODE=start needs an existing production apps/web/.next build. This skill does not run next build.');
}
if (!owned && mode === 'dev') {
  console.error(
    'verify-web doctor: no production build; starting next dev. Local next build is not run on an agent laptop.'
  );
}

const running = owned ?? startServer(mode);
if (owned && owned.port !== port) {
  fail(`an owned server is already on port ${owned.port}. Run cleanup.mjs before using VERIFY_WEB_PORT=${port}.`);
}

const result = await waitForReady(running.baseUrl, running.pid);
report(result, running);
