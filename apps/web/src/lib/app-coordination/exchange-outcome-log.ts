import {
  EXTERNAL_APP_WORKSPACE_BOUND_SIGN_IN_ERROR,
  EXTERNAL_APP_WORKSPACE_REQUIRED_CODE,
} from './external-app-workspace';

export const EXCHANGE_LOG_PREFIX = '[app-token-exchange]';

export type ExchangeOutcome =
  | 'ok'
  | 'refresh-ok'
  | 'workspace-id-required'
  | 'strict-binding-refused'
  | 'forbidden'
  | 'unauthorized'
  | 'bad-request'
  | 'rate-limited'
  | 'error';

/** What the route knows about a request; set as it learns more. */
export type ExchangeLogContext = {
  appId?: unknown;
  refresh: boolean;
  /** The app credential was verified; before that `appId` is only claimed. */
  verified: boolean;
};

const APP_ID_PATTERN = /^[a-z0-9_-]+$/u;

/** Lower-cased, capped at 64 chars, `[a-z0-9_-]` only; else `invalid`. */
export function sanitizeExchangeAppId(appId: unknown) {
  if (typeof appId !== 'string') return 'invalid';
  const id = appId.toLowerCase().slice(0, 64);
  return APP_ID_PATTERN.test(id) ? id : 'invalid';
}

export function classifyExchangeOutcome({
  code,
  error,
  refresh,
  status,
}: {
  code?: unknown;
  error?: unknown;
  refresh: boolean;
  status: number;
}): ExchangeOutcome {
  if (status >= 200 && status < 300) return refresh ? 'refresh-ok' : 'ok';
  if (status === 400) {
    return code === EXTERNAL_APP_WORKSPACE_REQUIRED_CODE
      ? 'workspace-id-required'
      : 'bad-request';
  }
  if (status === 401) {
    return error === EXTERNAL_APP_WORKSPACE_BOUND_SIGN_IN_ERROR
      ? 'strict-binding-refused'
      : 'unauthorized';
  }
  if (status === 403) return 'forbidden';
  return status === 429 ? 'rate-limited' : 'error';
}

/**
 * One structured line per exchange: app id, outcome class, status, whether it
 * was a refresh and whether the app credential was verified (an unverified
 * `appId` is whatever the caller claimed). Never tokens, emails, user or workspace ids, IPs or bodies.
 */
export function logExchangeOutcome(
  context: ExchangeLogContext,
  outcome: ExchangeOutcome,
  status: number
) {
  const fields = {
    appId: sanitizeExchangeAppId(context.appId),
    outcome,
    refresh: context.refresh,
    status,
    verified: context.verified,
  };
  if (status >= 500) console.error(EXCHANGE_LOG_PREFIX, fields);
  else if (outcome === 'ok' || outcome === 'refresh-ok') {
    console.info(EXCHANGE_LOG_PREFIX, fields);
  } else console.warn(EXCHANGE_LOG_PREFIX, fields);
}

/** Logs the outcome of `response`; reads only `code`/`error` of a 4xx body. */
export async function logExchangeResponse(
  context: ExchangeLogContext,
  response: Response
) {
  let code: unknown;
  let error: unknown;
  if (response.status === 400 || response.status === 401) {
    try {
      const body = (await response.clone().json()) as {
        code?: unknown;
        error?: unknown;
      };
      code = body?.code;
      error = body?.error;
    } catch {}
  }
  logExchangeOutcome(
    context,
    classifyExchangeOutcome({
      code,
      error,
      refresh: context.refresh,
      status: response.status,
    }),
    response.status
  );
}

/**
 * Runs `handler` and logs its outcome once. Logging never changes the
 * response: a failure while logging is swallowed.
 */
export async function runLoggedExchange(
  handler: (context: ExchangeLogContext) => Promise<Response>
) {
  const context: ExchangeLogContext = { refresh: false, verified: false };
  let response: Response;
  try {
    response = await handler(context);
  } catch (error) {
    try {
      logExchangeOutcome(context, 'error', 500);
    } catch {}
    throw error;
  }
  try {
    await logExchangeResponse(context, response);
  } catch {}
  return response;
}
