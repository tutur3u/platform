import { describe, expect, it } from 'vitest';
import {
  Effect,
  forEachConcurrently,
  fromDataError,
  fromPromise,
  runEffectAsResult,
  serializeTuturuuuEffectError,
  TuturuuuEffectError,
  toTuturuuuEffectError,
  withTuturuuuRetry,
  withTuturuuuTimeout,
} from './effect';

describe('@tuturuuu/utils/effect', () => {
  it('creates tagged Tuturuuu errors with metadata', () => {
    const error = new TuturuuuEffectError({
      code: 'TEST_ERROR',
      message: 'Test failed',
      status: 418,
      context: { feature: 'effect' },
    });

    expect(error._tag).toBe('TuturuuuEffectError');
    expect(error.message).toBe('Test failed');
    expect(serializeTuturuuuEffectError(error)).toEqual({
      _tag: 'TuturuuuEffectError',
      code: 'TEST_ERROR',
      message: 'Test failed',
      status: 418,
      context: { feature: 'effect' },
    });
  });

  it('normalizes unknown errors with fallback metadata', () => {
    const error = toTuturuuuEffectError(new Error('Boom'), {
      code: 'FALLBACK',
      message: 'Fallback message',
      status: 500,
    });

    expect(error).toBeInstanceOf(TuturuuuEffectError);
    expect(error.code).toBe('FALLBACK');
    expect(error.message).toBe('Boom');
    expect(error.status).toBe(500);
  });

  it('converts data/error style operations into successful effects', async () => {
    const result = await Effect.runPromise(
      fromDataError(
        () => Promise.resolve({ data: { id: 'row-1' }, error: null }),
        {
          code: 'DATA_ERROR',
          message: 'Data read failed',
        }
      )
    );

    expect(result).toEqual({ id: 'row-1' });
  });

  it('converts data/error style failures into typed errors', async () => {
    const result = await runEffectAsResult(
      fromDataError(
        () =>
          Promise.resolve({
            data: null,
            error: {
              code: 'PGRST116',
              message: 'No row found',
              details: 'Expected one row',
            },
          }),
        {
          code: 'DATA_ERROR',
          message: 'Data read failed',
        }
      )
    );

    expect(result).toEqual({
      ok: false,
      error: {
        _tag: 'TuturuuuEffectError',
        code: 'PGRST116',
        message: 'No row found',
        context: { details: 'Expected one row' },
      },
    });
  });

  it('converts rejected promises into typed errors', async () => {
    const result = await runEffectAsResult(
      fromPromise(() => Promise.reject(new Error('Network failed')), {
        code: 'NETWORK_FAILED',
        message: 'Request failed',
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        _tag: 'TuturuuuEffectError',
        code: 'NETWORK_FAILED',
        message: 'Network failed',
      });
    }
  });

  it('returns success and failure result shapes', async () => {
    await expect(runEffectAsResult(Effect.succeed('ok'))).resolves.toEqual({
      ok: true,
      data: 'ok',
    });

    await expect(
      runEffectAsResult(
        Effect.fail(
          new TuturuuuEffectError({
            code: 'EXPECTED_FAILURE',
            message: 'Expected failure',
          })
        )
      )
    ).resolves.toEqual({
      ok: false,
      error: {
        _tag: 'TuturuuuEffectError',
        code: 'EXPECTED_FAILURE',
        message: 'Expected failure',
      },
    });
  });

  it('retries expected failures with a typed retry predicate', async () => {
    let attempts = 0;
    const program = Effect.flatMap(
      Effect.sync(() => {
        attempts += 1;
        return attempts;
      }),
      (attempt) =>
        attempt < 3
          ? Effect.fail(
              new TuturuuuEffectError({
                code: 'TRANSIENT_FAILURE',
                message: 'Try again',
              })
            )
          : Effect.succeed('ready')
    );

    await expect(
      Effect.runPromise(
        withTuturuuuRetry(program, {
          times: 2,
          while: (error) => error.code === 'TRANSIENT_FAILURE',
        })
      )
    ).resolves.toBe('ready');
    expect(attempts).toBe(3);
  });

  it('does not retry when the retry predicate rejects the error', async () => {
    let attempts = 0;

    const result = await runEffectAsResult(
      withTuturuuuRetry(
        Effect.flatMap(
          Effect.sync(() => {
            attempts += 1;
          }),
          () =>
            Effect.fail(
              new TuturuuuEffectError({
                code: 'PERMANENT_FAILURE',
                message: 'Do not retry',
              })
            )
        ),
        {
          times: 3,
          while: (error) => error.code === 'TRANSIENT_FAILURE',
        }
      )
    );

    expect(attempts).toBe(1);
    expect(result).toEqual({
      ok: false,
      error: {
        _tag: 'TuturuuuEffectError',
        code: 'PERMANENT_FAILURE',
        message: 'Do not retry',
      },
    });
  });

  it('converts timeouts into Tuturuuu effect errors', async () => {
    const result = await runEffectAsResult(
      withTuturuuuTimeout(Effect.never, {
        code: 'TIMED_OUT',
        duration: 0,
        message: 'Operation timed out',
        context: { operation: 'test' },
      })
    );

    expect(result).toEqual({
      ok: false,
      error: {
        _tag: 'TuturuuuEffectError',
        code: 'TIMED_OUT',
        message: 'Operation timed out',
        context: { operation: 'test' },
      },
    });
  });

  it('runs effectful collections with bounded concurrency', async () => {
    let active = 0;
    let maxActive = 0;

    const result = await Effect.runPromise(
      forEachConcurrently(
        [1, 2, 3, 4],
        (item) =>
          Effect.promise(
            () =>
              new Promise<number>((resolve) => {
                active += 1;
                maxActive = Math.max(maxActive, active);

                setTimeout(() => {
                  active -= 1;
                  resolve(item * 2);
                }, 5);
              })
          ),
        { concurrency: 2 }
      )
    );

    expect(result).toEqual([2, 4, 6, 8]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
