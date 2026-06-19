import { describe, expect, it } from 'vitest';
import {
  Effect,
  fromDataError,
  fromPromise,
  runEffectAsResult,
  serializeTuturuuuEffectError,
  TuturuuuEffectError,
  toTuturuuuEffectError,
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
});
