import {
  Cause,
  Context,
  Data,
  Duration,
  Effect,
  Either,
  Exit,
  Layer,
  Option,
  Schedule,
} from 'effect';

export {
  Cause,
  Context,
  Data,
  Duration,
  Effect,
  Either,
  Layer,
  Option,
  Schedule,
};

export type TuturuuuEffectErrorContext = Record<string, unknown>;

export interface TuturuuuEffectErrorOptions {
  readonly code: string;
  readonly message: string;
  readonly status?: number;
  readonly cause?: unknown;
  readonly context?: TuturuuuEffectErrorContext;
}

export class TuturuuuEffectError extends Data.TaggedError(
  'TuturuuuEffectError'
)<TuturuuuEffectErrorOptions> {}

export interface SerializedTuturuuuEffectError {
  readonly _tag: 'TuturuuuEffectError';
  readonly code: string;
  readonly message: string;
  readonly status?: number;
  readonly context?: TuturuuuEffectErrorContext;
  readonly cause?: {
    readonly name?: string;
    readonly message: string;
  };
}

export type TuturuuuEffectResult<T> =
  | {
      readonly ok: true;
      readonly data: T;
    }
  | {
      readonly ok: false;
      readonly error: SerializedTuturuuuEffectError;
    };

export type DataErrorResult<TData, TError = unknown> = {
  readonly data: TData;
  readonly error: TError | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readStringProperty(
  source: Record<string, unknown> | undefined,
  key: string
) {
  const value = source?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readNumberProperty(
  source: Record<string, unknown> | undefined,
  key: string
) {
  const value = source?.[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function buildContext(
  source: Record<string, unknown> | undefined,
  fallbackContext: TuturuuuEffectErrorContext | undefined
) {
  const context: TuturuuuEffectErrorContext = { ...(fallbackContext ?? {}) };
  const details = readStringProperty(source, 'details');
  const hint = readStringProperty(source, 'hint');

  if (details) context.details = details;
  if (hint) context.hint = hint;

  return Object.keys(context).length > 0 ? context : undefined;
}

export function toTuturuuuEffectError(
  error: unknown,
  fallback: TuturuuuEffectErrorOptions
) {
  if (error instanceof TuturuuuEffectError) {
    return error;
  }

  const source = isRecord(error) ? error : undefined;
  const message =
    error instanceof Error && error.message
      ? error.message
      : readStringProperty(source, 'message') || fallback.message;

  return new TuturuuuEffectError({
    code: readStringProperty(source, 'code') || fallback.code,
    message,
    status: readNumberProperty(source, 'status') ?? fallback.status,
    cause: error,
    context: buildContext(source, fallback.context),
  });
}

export function serializeTuturuuuEffectError(
  error: TuturuuuEffectError
): SerializedTuturuuuEffectError {
  return {
    _tag: error._tag,
    code: error.code,
    message: error.message,
    ...(error.status !== undefined ? { status: error.status } : {}),
    ...(error.context ? { context: error.context } : {}),
    ...(error.cause instanceof Error
      ? {
          cause: {
            name: error.cause.name,
            message: error.cause.message,
          },
        }
      : {}),
  };
}

export function fromPromise<T>(
  evaluate: (signal: AbortSignal) => PromiseLike<T>,
  fallback: TuturuuuEffectErrorOptions
): Effect.Effect<T, TuturuuuEffectError> {
  return Effect.tryPromise({
    try: evaluate,
    catch: (error) => toTuturuuuEffectError(error, fallback),
  });
}

export function fromDataError<TData, TError = unknown>(
  operation: (
    signal: AbortSignal
  ) => PromiseLike<DataErrorResult<TData, TError>>,
  fallback: TuturuuuEffectErrorOptions
): Effect.Effect<TData, TuturuuuEffectError> {
  return Effect.flatMap(fromPromise(operation, fallback), (result) =>
    result.error
      ? Effect.fail(toTuturuuuEffectError(result.error, fallback))
      : Effect.succeed(result.data)
  );
}

export async function runEffectAsResult<T>(
  program: Effect.Effect<T, TuturuuuEffectError, never>
): Promise<TuturuuuEffectResult<T>> {
  const exit = await Effect.runPromiseExit(program);

  if (Exit.isSuccess(exit)) {
    return {
      ok: true,
      data: exit.value,
    };
  }

  const failure = Cause.failureOption(exit.cause);
  const error = Option.isSome(failure)
    ? failure.value
    : new TuturuuuEffectError({
        code: 'EFFECT_DEFECT',
        message: Cause.pretty(exit.cause),
        cause: exit.cause,
      });

  return {
    ok: false,
    error: serializeTuturuuuEffectError(error),
  };
}
