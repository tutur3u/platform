#!/usr/bin/env bun

const http = require('node:http');
const {
  createDockerControlConfig,
  recoverCronRunner,
  startCronRunnerWatchdog,
  writeJsonFile,
} = require('./docker-control-recovery.js');

const CONFIG = createDockerControlConfig();

let lastRecovery = null;
let watchdog = {
  cooldownRemainingMs: null,
  enabled: CONFIG.watchdog.enabled,
  lastCheckedAt: null,
  lastError: null,
  lastReason: null,
  status: CONFIG.watchdog.enabled ? 'unknown' : 'disabled',
};

function writeStatus(extra = {}) {
  writeJsonFile(CONFIG.statusFile, {
    kind: 'docker-control-status',
    pid: process.pid,
    service: 'web-docker-control',
    updatedAt: Date.now(),
    ...extra,
    lastRecovery,
    watchdog,
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
  if (!CONFIG.token) return false;
  const header = request.headers.authorization;
  return header === `Bearer ${CONFIG.token}`;
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

  const recovery = await recoverCronRunner({
    action,
    config: CONFIG,
    onRecovery: (nextRecovery) => {
      lastRecovery = nextRecovery;
      writeStatus();
    },
    reason:
      typeof payload?.reason === 'string'
        ? payload.reason
        : 'Operator requested cron runner recovery.',
    source: 'operator',
  });

  if (recovery.status === 'failed') {
    jsonResponse(response, 500, {
      message: 'Docker control recovery failed',
      recovery,
    });
    return;
  }

  jsonResponse(response, 200, {
    message:
      action === 'restart'
        ? 'Restarted cron runner service.'
        : 'Ensured watcher and cron runner services are serving.',
    recovery,
  });
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    writeStatus();
    jsonResponse(response, 200, {
      ok: true,
      service: 'web-docker-control',
      watchdog,
    });
    return;
  }

  if (request.method === 'POST' && request.url === '/v1/cron/recovery') {
    await handleRecovery(request, response);
    return;
  }

  jsonResponse(response, 404, { message: 'Not found' });
});

startCronRunnerWatchdog({
  config: CONFIG,
  onRecovery: (nextRecovery) => {
    lastRecovery = nextRecovery;
    writeStatus();
  },
  onStatus: (nextWatchdog, recovery) => {
    watchdog = nextWatchdog;
    if (recovery) {
      lastRecovery = recovery;
    }
    writeStatus();
  },
});

server.listen(CONFIG.port, '0.0.0.0', () => {
  writeStatus();
});
