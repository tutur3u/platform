const http = require('node:http');
const https = require('node:https');

const DRAIN_STATUS_PATH =
  process.env.DOCKER_WEB_DRAIN_STATUS_PATH ?? '/__platform/drain-status';
const HEALTH_PATH = '/api/health';
const INTERNAL_DRAIN_STATUS_HEADER = 'x-platform-internal-drain-status';
const INTERNAL_DRAIN_STATUS_HEADER_VALUE = '1';
const DEPLOYMENT_STAMP = process.env.PLATFORM_DEPLOYMENT_STAMP?.trim() || null;
const DEPLOYMENT_COLOR = process.env.PLATFORM_BLUE_GREEN_COLOR?.trim() || null;

let inflightRequests = 0;
let shuttingDown = false;

function normalizeAddress(address) {
  if (typeof address !== 'string') {
    return '';
  }

  return address.startsWith('::ffff:')
    ? address.slice('::ffff:'.length)
    : address;
}

function isLocalAddress(address) {
  const normalizedAddress = normalizeAddress(address);

  return (
    normalizedAddress === '127.0.0.1' ||
    normalizedAddress === '::1' ||
    normalizedAddress === 'localhost'
  );
}

function isPrivateNetworkAddress(address) {
  const normalizedAddress = normalizeAddress(address);
  const ipv4Parts = normalizedAddress.split('.').map((part) => Number(part));

  if (
    ipv4Parts.length === 4 &&
    ipv4Parts.every(
      (part) => Number.isInteger(part) && part >= 0 && part <= 255
    )
  ) {
    const [first, second] = ipv4Parts;

    return (
      first === 10 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }

  const lowerAddress = normalizedAddress.toLowerCase();

  return (
    lowerAddress.startsWith('fc') ||
    lowerAddress.startsWith('fd') ||
    lowerAddress.startsWith('fe80:')
  );
}

function getHeaderValue(request, name) {
  const value = request.headers?.[name];

  return Array.isArray(value) ? value[0] : value;
}

function isInternalDrainStatusRequestAllowed(request) {
  const remoteAddress = request.socket?.remoteAddress;

  if (isLocalAddress(remoteAddress)) {
    return true;
  }

  return (
    getHeaderValue(request, INTERNAL_DRAIN_STATUS_HEADER) ===
      INTERNAL_DRAIN_STATUS_HEADER_VALUE &&
    isPrivateNetworkAddress(remoteAddress)
  );
}

function getPathname(request) {
  try {
    return new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  } catch {
    return '/';
  }
}

function isTrackedRequest(request) {
  const pathname = getPathname(request);
  return pathname !== DRAIN_STATUS_PATH && pathname !== HEALTH_PATH;
}

function respondWithDrainStatus(response) {
  response.statusCode = 200;
  setDeploymentHeaders(response);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json');
  response.end(
    JSON.stringify({
      inflightRequests,
      shuttingDown,
      timestamp: Date.now(),
    })
  );
}

function setDeploymentHeaders(response) {
  if (DEPLOYMENT_STAMP) {
    response.setHeader('X-Platform-Deployment-Stamp', DEPLOYMENT_STAMP);
  }

  if (DEPLOYMENT_COLOR) {
    response.setHeader('X-Platform-Blue-Green-Color', DEPLOYMENT_COLOR);
  }
}

function patchServerModule(serverModule) {
  const originalEmit = serverModule.Server.prototype.emit;

  if (originalEmit.__dockerWebDrainPatched) {
    return;
  }

  function emitWithDrainTracking(eventName, ...args) {
    if (eventName !== 'request') {
      return originalEmit.call(this, eventName, ...args);
    }

    const [request, response] = args;
    const pathname = getPathname(request);

    if (
      pathname === DRAIN_STATUS_PATH &&
      isInternalDrainStatusRequestAllowed(request)
    ) {
      respondWithDrainStatus(response);
      return true;
    }

    const tracked = isTrackedRequest(request);

    setDeploymentHeaders(response);

    if (!tracked) {
      return originalEmit.call(this, eventName, ...args);
    }

    inflightRequests += 1;
    let finalized = false;
    const finalize = () => {
      if (finalized) {
        return;
      }

      finalized = true;
      inflightRequests = Math.max(0, inflightRequests - 1);
    };

    response.once('finish', finalize);
    response.once('close', finalize);

    return originalEmit.call(this, eventName, ...args);
  }

  emitWithDrainTracking.__dockerWebDrainPatched = true;
  serverModule.Server.prototype.emit = emitWithDrainTracking;
}

patchServerModule(http);
patchServerModule(https);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shuttingDown = true;
  });
}

module.exports = {
  INTERNAL_DRAIN_STATUS_HEADER,
  INTERNAL_DRAIN_STATUS_HEADER_VALUE,
  isInternalDrainStatusRequestAllowed,
  isLocalAddress,
  isPrivateNetworkAddress,
};
