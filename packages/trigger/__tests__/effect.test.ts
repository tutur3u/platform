import { Effect, runEffectAsResult } from '@tuturuuu/utils/effect';
import { describe, expect, it, vi } from 'vitest';
import {
  callInternalPlatformJsonEffect,
  scheduleTasksEffect,
  TriggerHttpService,
} from '../src/effect';

type TriggerProgram<T> = Effect.Effect<T, unknown, TriggerHttpService>;

function provideTriggerHttp<T>(
  program: TriggerProgram<T>,
  service: {
    fetch?: typeof fetch;
    readSecretKey?: () => string | undefined;
    resolveBaseUrl?: () => string;
  }
) {
  return program.pipe(
    Effect.provideService(TriggerHttpService, {
      fetch: service.fetch ?? vi.fn(),
      readSecretKey: service.readSecretKey ?? (() => 'test-secret'),
      resolveBaseUrl: service.resolveBaseUrl ?? (() => 'https://tuturuuu.test'),
    })
  );
}

describe('@tuturuuu/trigger/effect', () => {
  it('calls an internal platform JSON endpoint successfully', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ scheduled: true }),
    });

    const result = await Effect.runPromise(
      provideTriggerHttp(scheduleTasksEffect('ws-1'), {
        fetch: fetchMock,
      })
    );

    expect(result).toEqual({ scheduled: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuturuuu.test/api/ws-1/calendar/auto-schedule?stream=false',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-trigger-secret-key': 'test-secret',
        },
      })
    );
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('fails when the internal trigger secret is missing', async () => {
    const result = await runEffectAsResult(
      provideTriggerHttp(scheduleTasksEffect('ws-1'), {
        readSecretKey: () => undefined,
      })
    );

    expect(result).toEqual({
      ok: false,
      error: {
        _tag: 'TuturuuuEffectError',
        code: 'TRIGGER_SECRET_MISSING',
        message: 'INTERNAL_TRIGGER_SECRET_KEY is not set',
      },
    });
  });

  it('fails when the internal response is not ok', async () => {
    const result = await runEffectAsResult(
      provideTriggerHttp(scheduleTasksEffect('ws-1', { retry: false }), {
        fetch: vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
          json: () => Promise.resolve({}),
        }),
      })
    );

    expect(result).toEqual({
      ok: false,
      error: {
        _tag: 'TuturuuuEffectError',
        code: 'TRIGGER_INTERNAL_RESPONSE_NOT_OK',
        message: 'Internal platform request failed with HTTP 503',
        status: 503,
        context: {
          path: '/api/ws-1/calendar/auto-schedule?stream=false',
        },
      },
    });
  });

  it('retries retryable internal platform failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ scheduled: true }),
      });

    const result = await Effect.runPromise(
      provideTriggerHttp(
        scheduleTasksEffect('ws-1', {
          retry: { times: 2 },
          timeout: false,
        }),
        { fetch: fetchMock }
      )
    );

    expect(result).toEqual({ scheduled: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('fails with a typed timeout when the request exceeds its limit', async () => {
    const result = await runEffectAsResult(
      provideTriggerHttp(
        callInternalPlatformJsonEffect('/api/slow', {
          retry: false,
          timeout: 0,
        }),
        {
          fetch: vi.fn(() => new Promise<Response>(() => {})),
        }
      )
    );

    expect(result).toEqual({
      ok: false,
      error: {
        _tag: 'TuturuuuEffectError',
        code: 'TRIGGER_INTERNAL_REQUEST_TIMEOUT',
        message: 'Internal platform request timed out.',
        context: { path: '/api/slow' },
      },
    });
  });

  it('passes method, headers, and JSON body to custom calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    await Effect.runPromise(
      provideTriggerHttp(
        callInternalPlatformJsonEffect('/api/custom', {
          body: { force: true },
          headers: { 'x-custom': 'yes' },
          method: 'PATCH',
        }),
        { fetch: fetchMock }
      )
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuturuuu.test/api/custom',
      expect.objectContaining({
        body: JSON.stringify({ force: true }),
        headers: {
          'Content-Type': 'application/json',
          'x-custom': 'yes',
          'x-internal-trigger-secret-key': 'test-secret',
        },
        method: 'PATCH',
      })
    );
  });
});
