/**
 * The paths a Fleet grantee may open: the Fleet access page, static assets
 * and the Fleet server functions in `src/fleet-access/api.ts`. Every other
 * path, including the command center and its server functions, stays
 * owner-only.
 *
 * Production builds name server functions by a SHA-256 of their file and
 * export, so the Vite config pins readable IDs for the Fleet functions only
 * and the Worker matches them exactly.
 */
export const FLEET_SERVER_FUNCTIONS = [
  'fleetAccessFn',
  'fleetDigestFn',
  'fleetIntentsFn',
  'submitFleetIntentFn',
  'issueFleetLinkCodeFn',
  'confirmFleetLinkFn',
] as const;

const FLEET_ID_PREFIX = 'fleet-access.';
const FLEET_API_FILE = /[\\/]src[\\/]fleet-access[\\/]api\.ts$/;

/** `serverFns.generateFunctionId`: undefined keeps the default hash. */
export function fleetServerFunctionId({
  filename,
  functionName,
}: {
  filename: string;
  functionName: string;
}) {
  return FLEET_API_FILE.test(filename) &&
    (FLEET_SERVER_FUNCTIONS as readonly string[]).includes(functionName)
    ? `${FLEET_ID_PREFIX}${functionName}`
    : undefined;
}

const fleetIds = new Set<string>(
  FLEET_SERVER_FUNCTIONS.map((name) => `${FLEET_ID_PREFIX}${name}`)
);

export function isFleetPath(method: string, url: URL, basePath: string) {
  if (basePath && !url.pathname.startsWith(`${basePath}/`)) return false;
  const path = url.pathname.slice(basePath.length);
  const read = method === 'GET' || method === 'HEAD';
  if (/^\/(?:en|vi)\/fleet-access\/?$/.test(path)) return read;
  if (path.startsWith('/assets/') && !path.includes('..')) return read;
  const call = /^\/_serverFn\/([^/]+)$/.exec(path);
  return call ? fleetIds.has(call[1] ?? '') : false;
}
