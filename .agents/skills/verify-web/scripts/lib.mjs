import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const require = createRequire(import.meta.url);

export const LANDMARK = 'Your Team.';
export const DOCTOR_PATH = '/en';
export const DEFAULT_PORT = 7803;
export const READY_TIMEOUT_MS = 8 * 60 * 1000;
export const OWNER = 'verify-web';

export function findRepoRoot(start) {
  let dir = path.resolve(start);
  for (let i = 0; i < 8; i += 1) {
    if (
      fs.existsSync(path.join(dir, 'apps/web/package.json')) &&
      fs.existsSync(path.join(dir, 'scripts/e2e-local-environment.js'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('verify-web must run inside the platform checkout.');
}

export function skillPaths(root) {
  return {
    root,
    webDir: path.join(root, 'apps/web'),
    stateDir: path.join(root, 'tmp/verify-web'),
    statePath: path.join(root, 'tmp/verify-web/state.json'),
    logPath: path.join(root, 'tmp/verify-web/web.log'),
  };
}

export function hasProductionBuild(webDir) {
  return ['BUILD_ID', 'routes-manifest.json', 'required-server-files.json'].every(
    (name) => fs.existsSync(path.join(webDir, '.next', name))
  );
}

export function resolveNextBin(root, webDir) {
  const candidates = [
    path.join(webDir, 'node_modules/next/dist/bin/next'),
    path.join(root, 'node_modules/next/dist/bin/next'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      'next is not installed. From the repo root run `bun install --frozen-lockfile`. Do not run `bun setup` or `next build` on an agent laptop.'
    );
  }
  return found;
}

export function readState(statePath) {
  if (!fs.existsSync(statePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

export function writeState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function psField(pid, field) {
  const result = spawnSync('ps', ['-ww', '-p', String(pid), '-o', `${field}=`], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return '';
  return result.stdout.trim();
}

export function processSnapshot(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  const command = psField(pid, 'command');
  const lstart = psField(pid, 'lstart');
  if (!command || !lstart) return null;
  return { pid, lstart, command };
}

export function isOwnedProcess(state, snapshot) {
  if (!state || !snapshot) return false;
  if (snapshot.pid !== state.pid) return false;
  if (state.lstart && snapshot.lstart !== state.lstart) return false;
  if (!snapshot.command.includes(`${state.nextBin}`)) return false;
  if (!snapshot.command.includes(`-p ${state.port}`)) return false;
  return snapshot.command.includes(` ${state.mode} `) || snapshot.command.includes(` ${state.mode}`);
}

export function descendantPids(pid) {
  const result = spawnSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout.trim()) return [];
  const children = result.stdout
    .trim()
    .split('\n')
    .map((line) => Number.parseInt(line, 10))
    .filter((value) => Number.isInteger(value) && value > 0);
  return children.flatMap((child) => [child, ...descendantPids(child)]);
}

export function ownsPid(rootPid, pid) {
  return pid === rootPid || descendantPids(rootPid).includes(pid);
}

function signalPid(pid, signal) {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

export function killOwned(state) {
  const snapshot = processSnapshot(state?.pid);
  if (!isOwnedProcess(state, snapshot)) {
    return { killed: false, reason: snapshot ? 'pid is not the server this skill started' : 'server is not running' };
  }

  const targets = [state.pid, ...descendantPids(state.pid)];
  try {
    process.kill(-state.pid, 'SIGTERM');
  } catch {
    for (const pid of targets) signalPid(pid, 'SIGTERM');
  }

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && processSnapshot(state.pid)) {
    spawnSync('sleep', ['0.2']);
  }

  if (processSnapshot(state.pid)) {
    try {
      process.kill(-state.pid, 'SIGKILL');
    } catch {
      for (const pid of [state.pid, ...descendantPids(state.pid)]) {
        signalPid(pid, 'SIGKILL');
      }
    }
  }

  return { killed: !processSnapshot(state.pid), reason: 'stopped the owned server' };
}

export function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

export function listenerPid(port) {
  const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
    encoding: 'utf8',
  });
  if (result.status !== 0 || !result.stdout.trim()) return null;
  const pid = Number.parseInt(result.stdout.trim().split('\n')[0], 10);
  return Number.isInteger(pid) ? pid : null;
}

export function buildChildEnv(root, port) {
  const e2e = require(path.join(root, 'scripts/e2e-local-environment.js'));
  const baseUrl = `http://127.0.0.1:${port}`;
  const supabaseUrl = e2e.LOCAL_E2E_SUPABASE_URL;
  return {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    TMPDIR: process.env.TMPDIR || '/tmp',
    LANG: process.env.LANG || 'C.UTF-8',
    NODE_OPTIONS: '--experimental-require-module',
    NEXT_TELEMETRY_DISABLED: '1',
    PORT: String(port),
    VERIFY_WEB_OWNER: OWNER,
    APP_COORDINATION_TOKEN_SECRET: e2e.LOCAL_E2E_APP_COORDINATION_SECRET,
    BASE_URL: baseUrl,
    CRON_SECRET: e2e.LOCAL_E2E_CRON_SECRET,
    NEXT_PUBLIC_APP_URL: baseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: e2e.LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_TUTURUUU_LOCAL_E2E_AUTH_BYPASS: e2e.LOCAL_E2E_AUTH_BYPASS,
    NEXT_PUBLIC_WEB_APP_URL: baseUrl,
    SUPABASE_SECRET_KEY: e2e.LOCAL_E2E_SUPABASE_SECRET_KEY,
    SUPABASE_SERVER_URL: supabaseUrl,
    SUPABASE_URL: supabaseUrl,
    TUTURUUU_APP_COORDINATION_SECRET: e2e.LOCAL_E2E_APP_COORDINATION_SECRET,
    TUTURUUU_LOCAL_E2E_AUTH_BYPASS: e2e.LOCAL_E2E_AUTH_BYPASS,
    WEB_APP_URL: baseUrl,
  };
}

export function extractHeading(html) {
  const match = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i);
  if (!match) return '';
  return match[0]
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

export async function fetchLandmark(baseUrl) {
  const url = new URL(DOCTOR_PATH, baseUrl).href;
  const response = await fetch(url, { redirect: 'follow' });
  const html = await response.text();
  return {
    url,
    finalUrl: response.url,
    status: response.status,
    found: response.status === 200 && html.includes(LANDMARK),
    heading: extractHeading(html),
  };
}
