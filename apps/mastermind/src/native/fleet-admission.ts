/**
 * The paths a Fleet grantee may open: the Fleet access page and static assets
 * (GET only) and the Fleet server functions in `src/fleet-access/api.ts`
 * (GET queries and same-origin POST mutations). Every other path and method,
 * including the command center and its server functions, stays owner-only.
 *
 * Production builds name server functions by a SHA-256 of their file and
 * handler name, so the Vite config pins readable IDs for the Fleet functions
 * only and the Worker matches them exactly.
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
/** The compiler passes the module path relative to the app root. */
const FLEET_API_FILE = 'src/fleet-access/api.ts';
/** The compiler names each handler `<variable>_createServerFn_handler`. */
const HANDLER_SUFFIX = '_createServerFn_handler';

export const FLEET_SERVER_FUNCTION_IDS: readonly string[] =
  FLEET_SERVER_FUNCTIONS.map((name) => `${FLEET_ID_PREFIX}${name}`);

/** `serverFns.generateFunctionId`: undefined keeps the default hash. */
export function fleetServerFunctionId({
  filename,
  functionName,
}: {
  filename: string;
  functionName: string;
}) {
  if (filename.replaceAll('\\', '/') !== FLEET_API_FILE) return undefined;
  if (!functionName.endsWith(HANDLER_SUFFIX)) return undefined;
  const name = functionName.slice(0, -HANDLER_SUFFIX.length);
  return (FLEET_SERVER_FUNCTIONS as readonly string[]).includes(name)
    ? `${FLEET_ID_PREFIX}${name}`
    : undefined;
}

const fleetIds = new Set(FLEET_SERVER_FUNCTION_IDS);
// `/fleet-access` (English, no prefix) or `/vi/fleet-access`; the Worker
// redirects legacy `/en/...` paths before this gate runs.
const FLEET_PAGE = /^(?:\/vi)?\/fleet-access\/?$/;

export function isFleetPath(method: string, url: URL, basePath: string) {
  if (basePath && !url.pathname.startsWith(`${basePath}/`)) return false;
  const path = url.pathname.slice(basePath.length);
  if (FLEET_PAGE.test(path)) return method === 'GET';
  if (path.startsWith('/assets/') && !path.includes('..')) {
    return method === 'GET';
  }
  const call = /^\/_serverFn\/([^/]+)$/.exec(path);
  return call
    ? (method === 'GET' || method === 'POST') && fleetIds.has(call[1] ?? '')
    : false;
}

/** A grantee's login always returns to the Fleet page. */
export function fleetReturnPath(path: string) {
  const url = new URL(path, 'https://mastermind.tuturuuu.com');
  return FLEET_PAGE.test(url.pathname)
    ? `${url.pathname}${url.search}`
    : '/fleet-access';
}
