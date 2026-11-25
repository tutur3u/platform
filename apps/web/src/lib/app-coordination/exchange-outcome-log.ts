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
  | 'error';

/** What the route knows about a request; set as it learns more. */
export type ExchangeLogContext = { appId?: unknown; refresh: boolean };

const APP_ID_PATTERN = /^[a-z0-9._-]+$/u;

/** Lower-cased, capped at 64 chars, `[a-z0-9._-]` only; else `invalid`. */
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
  return status === 403 ? 'forbidden' : 'error';
}

/**
 * One structured line per exchange: app id, outcome class, status and whether
 * it was a refresh. Never tokens, emails, user or workspace ids, IPs or bodies.
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
