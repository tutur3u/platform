export const PROFILE_PREWARM_TIMEOUT_MS = 60_000;
export const PROFILE_PREWARM_MARKER = '[mail-profile-prewarm] ';
const bodyLimit = 8 * 1024 * 1024;
const reasons = new Set([
  'html-complete',
  'destination',
  'status',
  'mime',
  'body',
  'request-timeout',
  'request-failed',
  'disposal',
  'clock',
  'budget',
]);
class PreparationFailure extends Error {
  constructor(reason) {
    super('Profile preparation failed');
    this.reason = reason;
  }
}
const fail = (reason) => {
  throw new PreparationFailure(reason);
};
function destination(origin, workspaceId) {
  try {
    const url = new URL(origin);
    if (
      url.protocol !== 'http:' ||
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.port !== '7833' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu.test(workspaceId)
    )
      fail('destination');
    return new URL(`/${workspaceId}/profile`, url).href;
  } catch {
    return fail('destination');
  }
}

/**
 * The request context shares the owned synthetic actor's browser cookies.
 * A complete response warms compilation only; the browser still proves the UI.
 * @param {{get: (url: string, options: {timeout: number, maxRedirects: number, maxRetries: number}) => Promise<{status(): number, headers(): Record<string, string>, body(): Promise<Uint8Array>, dispose(): Promise<void>}>}} request
 * @param {string} origin
 * @param {string} workspaceId
 * @param {{now?: () => number, emit?: (line: string) => void}} [options]
 */
export async function prewarmProfileRoute(
  request,
  origin,
  workspaceId,
  options = {}
) {
  const now = options.now ?? (() => performance.now());
  const emit = options.emit ?? ((line) => console.info(line));
  const start = now();
  let response;
  let reason = 'html-complete';
  let bodyBytes = null;
  let responseComplete = false;
  let responseDisposed = null;
  try {
    response = await request.get(destination(origin, workspaceId), {
      timeout: PROFILE_PREWARM_TIMEOUT_MS,
      maxRedirects: 0,
      maxRetries: 0,
    });
    if (response.status() !== 200) fail('status');
    if (
      !/^text\/html(?:\s*;|\s*$)/iu.test(
        response.headers()['content-type'] ?? ''
      )
    )
      fail('mime');
    const body = await response.body();
    if (
      !(body instanceof Uint8Array) ||
      !body.length ||
      body.length > bodyLimit
    )
      fail('body');
    const prefix = new TextDecoder().decode(body.subarray(0, 1024));
    if (!/<(?:!doctype\s+html|html)(?:\s|>)/iu.test(prefix)) fail('body');
    bodyBytes = body.length;
    responseComplete = true;
  } catch (error) {
    reason =
      error instanceof PreparationFailure
        ? error.reason
        : error instanceof Error && error.name === 'TimeoutError'
          ? 'request-timeout'
          : 'request-failed';
  } finally {
    if (response) {
      try {
        await response.dispose();
        responseDisposed = true;
      } catch {
        responseDisposed = false;
        if (reason === 'html-complete') reason = 'disposal';
      }
    }
  }
  const observed = Math.floor(now() - start);
  const elapsedMs =
    Number.isSafeInteger(observed) && observed >= 0 && observed <= 2147483647
      ? observed
      : null;
  if (elapsedMs === null) reason = 'clock';
  else if (elapsedMs > PROFILE_PREWARM_TIMEOUT_MS && reason === 'html-complete')
    reason = 'budget';
  const receipt = {
    version: 1,
    scope: 'preparation-only',
    outcome: reason === 'html-complete' ? 'passed' : 'failed',
    reason,
    elapsedMs,
    bodyBytes,
    responseComplete,
    responseDisposed,
  };
  emit(`${PROFILE_PREWARM_MARKER}${JSON.stringify(receipt)}\n`);
  if (receipt.outcome !== 'passed')
    throw new Error(`Profile preparation failed (${reason})`);
  return receipt;
}

const unknown = (reason) => ({ state: 'unknown', reason });
const plain = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, max) =>
  Number.isInteger(value) && value >= 0 && value <= max;
export function profilePrewarmDiagnostics(result) {
  if (!plain(result)) return unknown('stream');
  if (result.stdout === undefined) return unknown('absent');
  if (!Array.isArray(result.stdout) || result.stdout.length > 256)
    return unknown('stream');
  let bytes = 0;
  let text = '';
  for (const entry of result.stdout) {
    if (
      !plain(entry) ||
      Object.keys(entry).length !== 1 ||
      typeof entry.text !== 'string'
    )
      return unknown('chunk');
    bytes += Buffer.byteLength(entry.text, 'utf8');
    if (bytes > 131072) return unknown('bytes');
    text += entry.text;
  }
  const at = text.indexOf(PROFILE_PREWARM_MARKER);
  if (at < 0) return unknown('absent');
  if (result.retry !== 0) return unknown('attempt');
  if (
    (at > 0 && text[at - 1] !== '\n') ||
    text.indexOf(PROFILE_PREWARM_MARKER, at + 1) >= 0
  )
    return unknown('framing');
  const end = text.indexOf('\n', at);
  if (end < 0) return unknown('partial');
  const payload = text.slice(at + PROFILE_PREWARM_MARKER.length, end);
  if (Buffer.byteLength(payload, 'utf8') > 512) return unknown('payload');
  try {
    const value = JSON.parse(payload);
    if (JSON.stringify(value) !== payload) return unknown('schema');
    const keys = [
      'version',
      'scope',
      'outcome',
      'reason',
      'elapsedMs',
      'bodyBytes',
      'responseComplete',
      'responseDisposed',
    ];
    if (
      !plain(value) ||
      Object.keys(value).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(value, key)) ||
      value.version !== 1 ||
      value.scope !== 'preparation-only' ||
      !['passed', 'failed'].includes(value.outcome) ||
      !reasons.has(value.reason) ||
      !(value.elapsedMs === null || integer(value.elapsedMs, 2147483647)) ||
      !(value.bodyBytes === null || integer(value.bodyBytes, bodyLimit)) ||
      typeof value.responseComplete !== 'boolean' ||
      ![null, true, false].includes(value.responseDisposed)
    )
      return unknown('schema');
    if (
      value.outcome === 'passed' &&
      (value.reason !== 'html-complete' ||
        !value.responseComplete ||
        value.responseDisposed !== true ||
        !integer(value.elapsedMs, PROFILE_PREWARM_TIMEOUT_MS) ||
        !integer(value.bodyBytes, bodyLimit) ||
        value.bodyBytes === 0)
    )
      return unknown('schema');
    if (value.outcome === 'failed' && value.reason === 'html-complete')
      return unknown('schema');
    return { state: 'observed', record: value };
  } catch {
    return unknown('schema');
  }
}

export function assertProfilePrewarmedResult(result) {
  const proof = profilePrewarmDiagnostics(result);
  if (proof.state !== 'observed' || proof.record.outcome !== 'passed')
    throw new Error('Missing successful profile preparation receipt');
}
