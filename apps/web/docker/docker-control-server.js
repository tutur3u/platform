#!/usr/bin/env bun

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT_DIR = process.env.PLATFORM_HOST_WORKSPACE_DIR || '/workspace-host';
const PROD_COMPOSE_FILE = path.join(ROOT_DIR, 'docker-compose.web.prod.yml');
const PORT = Number.parseInt(
  process.env.PLATFORM_DOCKER_CONTROL_PORT || '7810',
  10
);
const STATUS_FILE =
  process.env.PLATFORM_DOCKER_CONTROL_STATUS_FILE ||
  path.join(ROOT_DIR, 'tmp', 'docker-web', 'docker-control', 'status.json');
const TOKEN = process.env.PLATFORM_DOCKER_CONTROL_TOKEN || '';
const WATCHER_SERVICE = 'web-blue-green-watcher';
const CRON_RUNNER_SERVICE = 'web-cron-runner';

let lastRecovery = null;

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeStatus(extra = {}) {
  writeJsonFile(STATUS_FILE, {
    kind: 'docker-control-status',
    pid: process.pid,
    service: 'web-docker-control',
    updatedAt: Date.now(),
    ...extra,
    lastRecovery,
  });
}

function jsonResponse(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 4096) {
        reject(new Error('Request body is too large.'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function verifyAuthorization(request) {
  if (!TOKEN) return false;
  const header = request.headers.authorization;
  return header === `Bearer ${TOKEN}`;
}

function runCommand(command, args, { timeoutMs = 10 * 60 * 1000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        PLATFORM_HOST_WORKSPACE_DIR: ROOT_DIR,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      stdout = stdout.slice(-4000);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      stderr = stderr.slice(-4000);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: 1, signal: null, stdout, stderr: error.message });
    });
  });
}

function composeUpArgs(serviceName, recreateMode) {
  return [
    'compose',
    '-f',
    PROD_COMPOSE_FILE,
    '--profile',
    'redis',
    'up',
    '--build',
    '--detach',
    recreateMode,
    '--remove-orphans',
    serviceName,
  ];
}

function sanitizeCommandResult(result, serviceName) {
  return {
    code: result.code,
    detail: `${serviceName} compose command failed with exit code ${result.code ?? 'unknown'}.`,
    signal: result.signal,
  };
}

async function ensureService(serviceName, recreateMode) {
  const result = await runCommand(
    'docker',
    composeUpArgs(serviceName, recreateMode)
  );
  if (result.code !== 0) {
    throw new Error(sanitizeCommandResult(result, serviceName).detail);
  }
}

async function inspectService(serviceName) {
  const result = await runCommand(
    'docker',
    [
      'compose',
      '-f',
      PROD_COMPOSE_FILE,
      '--profile',
      'redis',
      'ps',
      '--format',
      'json',
      serviceName,
    ],
    { timeoutMs: 30_000 }
  );

  if (result.code !== 0) {
    return {
      detail: sanitizeCommandResult(result, serviceName).detail,
      serviceName,
      status: 'unknown',
    };
  }

  const lines = result.stdout.split(/\r?\n/u).filter(Boolean);
  const parsed = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .find(Boolean);

  return {
    serviceName,
    status: String(parsed?.Health || parsed?.State || 'missing').toLowerCase(),
  };
}

async function handleRecovery(request, response) {
  if (!verifyAuthorization(request)) {
    jsonResponse(response, 401, { message: 'Unauthorized' });
    return;
  }

  let payload;
  try {
    const body = await readBody(request);
    payload = body ? JSON.parse(body) : {};
  } catch {
    jsonResponse(response, 400, { message: 'Invalid recovery payload' });
    return;
  }

  const action = payload?.action;
  if (action !== 'ensure' && action !== 'restart') {
    jsonResponse(response, 400, { message: 'Unsupported recovery action' });
    return;
  }

  const startedAt = Date.now();
  lastRecovery = {
    action,
    requestedAt: new Date(startedAt).toISOString(),
    status: 'running',
  };
  writeStatus();

  try {
    await ensureService(WATCHER_SERVICE, '--no-recreate');
    await ensureService(
      CRON_RUNNER_SERVICE,
      action === 'restart' ? '--force-recreate' : '--no-recreate'
    );

    const [watcher, cronRunner] = await Promise.all([
      inspectService(WATCHER_SERVICE),
      inspectService(CRON_RUNNER_SERVICE),
    ]);

    lastRecovery = {
      action,
      completedAt: new Date().toISOString(),
      durationMs: Math.max(0, Date.now() - startedAt),
      requestedAt: new Date(startedAt).toISOString(),
      status: 'succeeded',
      services: {
        cronRunner,
        watcher,
      },
    };
    writeStatus();
    jsonResponse(response, 200, {
      message:
        action === 'restart'
          ? 'Restarted cron runner service.'
          : 'Ensured watcher and cron runner services are serving.',
      recovery: lastRecovery,
    });
  } catch (error) {
    lastRecovery = {
      action,
      completedAt: new Date().toISOString(),
      durationMs: Math.max(0, Date.now() - startedAt),
      error:
        error instanceof Error
          ? error.message.slice(0, 1000)
          : String(error).slice(0, 1000),
      requestedAt: new Date(startedAt).toISOString(),
      status: 'failed',
    };
    writeStatus();
    jsonResponse(response, 500, {
      message: 'Docker control recovery failed',
      recovery: lastRecovery,
    });
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    writeStatus();
    jsonResponse(response, 200, { ok: true, service: 'web-docker-control' });
    return;
  }

  if (request.method === 'POST' && request.url === '/v1/cron/recovery') {
    await handleRecovery(request, response);
    return;
  }

  jsonResponse(response, 404, { message: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  writeStatus();
});
