import {
  Context,
  type Duration,
  Effect,
  fromPromise,
  Layer,
  TuturuuuEffectError,
  type TuturuuuEffectRetryOptions,
  toTuturuuuEffectError,
  withTuturuuuRetry,
  withTuturuuuTimeout,
} from '@tuturuuu/utils/effect';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export const DEFAULT_TRIGGER_RETRYABLE_STATUS_CODES = [
  408, 425, 429, 500, 502, 503, 504,
] as const;

export const DEFAULT_TRIGGER_INTERNAL_TIMEOUT = '30 seconds';

export const DEFAULT_TRIGGER_INTERNAL_RETRY = {
  delay: '250 millis',
  times: 2,
} satisfies TuturuuuEffectRetryOptions<TuturuuuEffectError>;

export interface TriggerHttpServiceShape {
  readonly fetch: typeof fetch;
  readonly readSecretKey: () => string | undefined;
  readonly resolveBaseUrl: () => string;
}

export class TriggerHttpService extends Context.Tag(
  '@tuturuuu/trigger/TriggerHttpService'
)<TriggerHttpService, TriggerHttpServiceShape>() {}

export const TriggerHttpLive = Layer.succeed(TriggerHttpService, {
  fetch: (...args) => fetch(...args),
  readSecretKey: () => process.env.INTERNAL_TRIGGER_SECRET_KEY?.trim(),
  resolveBaseUrl: () =>
    process.env.NODE_ENV === 'production'
      ? 'https://tuturuuu.com'
      : getLocalInternalAppUrl('platform', 'http://localhost:7803'),
});

export interface InternalPlatformJsonEffectOptions {
  readonly body?: unknown;
  readonly headers?: HeadersInit;
  readonly method?: string;
  readonly retry?: false | TuturuuuEffectRetryOptions<TuturuuuEffectError>;
  readonly timeout?: false | Duration.DurationInput;
}

function resolveInternalPlatformUrl(baseUrl: string, path: string) {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/u, ''), normalizedBaseUrl).toString();
}

function isRetryableTriggerError(error: TuturuuuEffectError) {
  if (
    error.code === 'TRIGGER_INTERNAL_REQUEST_FAILED' ||
    error.code === 'TRIGGER_INTERNAL_REQUEST_TIMEOUT'
  ) {
    return true;
  }

  return (
    error.code === 'TRIGGER_INTERNAL_RESPONSE_NOT_OK' &&
    typeof error.status === 'number' &&
    DEFAULT_TRIGGER_RETRYABLE_STATUS_CODES.includes(
      error.status as (typeof DEFAULT_TRIGGER_RETRYABLE_STATUS_CODES)[number]
    )
  );
}

function applyInternalPlatformRequestPolicies<R>(
  program: Effect.Effect<Response, TuturuuuEffectError, R>,
  path: string,
  options: InternalPlatformJsonEffectOptions
) {
  const withTimeout =
    options.timeout === undefined || options.timeout === false
      ? program
      : withTuturuuuTimeout(program, {
          code: 'TRIGGER_INTERNAL_REQUEST_TIMEOUT',
          duration: options.timeout,
          message: 'Internal platform request timed out.',
          context: { path },
        });

  if (options.retry === undefined || options.retry === false) {
    return withTimeout;
  }

  return withTuturuuuRetry(withTimeout, {
    ...options.retry,
    while: options.retry.while ?? isRetryableTriggerError,
  });
}

export function callInternalPlatformJsonEffect<T = unknown>(
  path: string,
  options: InternalPlatformJsonEffectOptions = {}
): Effect.Effect<T, TuturuuuEffectError, TriggerHttpService> {
  return Effect.gen(function* () {
    const service = yield* TriggerHttpService;
    const secretKey = service.readSecretKey();

    if (!secretKey) {
      return yield* Effect.fail(
        new TuturuuuEffectError({
          code: 'TRIGGER_SECRET_MISSING',
          message: 'INTERNAL_TRIGGER_SECRET_KEY is not set',
        })
      );
    }

    const url = resolveInternalPlatformUrl(service.resolveBaseUrl(), path);
    const request = Effect.flatMap(
      fromPromise(
        (signal) =>
          service.fetch(url, {
            body:
              options.body === undefined
                ? undefined
                : JSON.stringify(options.body),
            headers: {
              'Content-Type': 'application/json',
              'x-internal-trigger-secret-key': secretKey,
              ...(options.headers ?? {}),
            },
            method: options.method ?? 'POST',
            signal,
          }),
        {
          code: 'TRIGGER_INTERNAL_REQUEST_FAILED',
          message: 'Internal platform request failed.',
          context: { path },
        }
      ),
      (response) =>
        response.ok
          ? Effect.succeed(response)
          : Effect.fail(
              new TuturuuuEffectError({
                code: 'TRIGGER_INTERNAL_RESPONSE_NOT_OK',
                message: `Internal platform request failed with HTTP ${response.status}`,
                status: response.status,
                context: { path },
              })
            )
    );

    const response = yield* applyInternalPlatformRequestPolicies(
      request,
      path,
      options
    );

    return yield* fromPromise(() => response.json() as Promise<T>, {
      code: 'TRIGGER_INTERNAL_JSON_FAILED',
      message: 'Internal platform response JSON parsing failed.',
      context: { path },
    }).pipe(
      Effect.mapError((error) =>
        toTuturuuuEffectError(error, {
          code: 'TRIGGER_INTERNAL_JSON_FAILED',
          message: 'Internal platform response JSON parsing failed.',
          context: { path },
        })
      )
    );
  });
}

export function scheduleTasksEffect<T = unknown>(
  wsId: string,
  options: Pick<InternalPlatformJsonEffectOptions, 'retry' | 'timeout'> = {}
): Effect.Effect<T, TuturuuuEffectError, TriggerHttpService> {
  return callInternalPlatformJsonEffect<T>(
    `/api/${wsId}/calendar/auto-schedule?stream=false`,
    {
      method: 'POST',
      retry: options.retry ?? DEFAULT_TRIGGER_INTERNAL_RETRY,
      timeout: options.timeout ?? DEFAULT_TRIGGER_INTERNAL_TIMEOUT,
    }
  );
}
