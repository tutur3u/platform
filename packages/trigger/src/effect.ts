import {
  Context,
  Effect,
  fromPromise,
  Layer,
  TuturuuuEffectError,
  toTuturuuuEffectError,
} from '@tuturuuu/utils/effect';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

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
}

function resolveInternalPlatformUrl(baseUrl: string, path: string) {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/u, ''), normalizedBaseUrl).toString();
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
    const response = yield* fromPromise(
      () =>
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
        }),
      {
        code: 'TRIGGER_INTERNAL_REQUEST_FAILED',
        message: 'Internal platform request failed.',
        context: { path },
      }
    );

    if (!response.ok) {
      return yield* Effect.fail(
        new TuturuuuEffectError({
          code: 'TRIGGER_INTERNAL_RESPONSE_NOT_OK',
          message: `Internal platform request failed with HTTP ${response.status}`,
          status: response.status,
          context: { path },
        })
      );
    }

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
  wsId: string
): Effect.Effect<T, TuturuuuEffectError, TriggerHttpService> {
  return callInternalPlatformJsonEffect<T>(
    `/api/${wsId}/calendar/auto-schedule?stream=false`,
    { method: 'POST' }
  );
}
