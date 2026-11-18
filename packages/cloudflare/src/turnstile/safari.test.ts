import {
  createTurnstileRetryScheduler,
  isPermanentTurnstileError,
  SAFARI_SAFE_TURNSTILE_OPTIONS,
  TURNSTILE_ORIGIN,
  withTurnstileCsp,
} from './client';

describe('withTurnstileCsp', () => {
  it('adds the origin to restricted directives and leaves absent ones absent', () => {
    expect(
      withTurnstileCsp(
        "script-src 'nonce-a' 'strict-dynamic'; object-src 'none'; frame-ancestors 'none'"
      )
    ).toBe(
      `script-src 'nonce-a' 'strict-dynamic' ${TURNSTILE_ORIGIN}; object-src 'none'; frame-ancestors 'none'`
    );
  });

  it('derives missing directives from default-src and replaces none', () => {
    expect(
      withTurnstileCsp(
        "default-src 'self'; frame-src 'none'; connect-src 'self'"
      )
    ).toBe(
      `default-src 'self'; frame-src ${TURNSTILE_ORIGIN}; connect-src 'self' ${TURNSTILE_ORIGIN}; script-src 'self' ${TURNSTILE_ORIGIN}; child-src 'self' ${TURNSTILE_ORIGIN}`
    );
  });

  it('does not duplicate an origin that is already allowed', () => {
    const policy = `script-src ${TURNSTILE_ORIGIN}`;
    expect(withTurnstileCsp(policy)).toBe(policy);
  });
});

describe('createTurnstileRetryScheduler', () => {
  function fakeTimers() {
    const pending: { run: () => void; ms: number }[] = [];
    return {
      pending,
      setTimer: (run: () => void, ms: number) => {
        pending.push({ run, ms });
        return pending.length;
      },
      clearTimer: () => {
        pending.length = 0;
      },
    };
  }

  it('never resets synchronously and backs off exponentially', () => {
    const timers = fakeTimers();
    const reset = vi.fn();
    const scheduler = createTurnstileRetryScheduler({ reset, ...timers });
    expect(scheduler.onError('600010')).toBe(true);
    expect(scheduler.onError('600010')).toBe(true);
    expect(reset).not.toHaveBeenCalled();
    expect(timers.pending.map((timer) => timer.ms)).toEqual([2000]);
    timers.pending.shift()!.run();
    expect(reset).toHaveBeenCalledTimes(1);
    scheduler.onError('600010');
    expect(timers.pending.map((timer) => timer.ms)).toEqual([4000]);
  });

  it('gives up after the attempt budget and on configuration errors', () => {
    const timers = fakeTimers();
    const onGiveUp = vi.fn();
    const scheduler = createTurnstileRetryScheduler({
      reset: vi.fn(),
      onGiveUp,
      maxAttempts: 2,
      ...timers,
    });
    for (let i = 0; i < 3; i++) {
      scheduler.onError('300030');
      timers.pending.shift()?.run();
    }
    expect(onGiveUp).toHaveBeenCalledWith('300030');
    expect(scheduler.onError('110200')).toBe(false);
    expect(isPermanentTurnstileError('110200')).toBe(true);
    expect(isPermanentTurnstileError('600010')).toBe(false);
  });

  it('restarts the budget after a token and cancels pending resets', () => {
    const timers = fakeTimers();
    const reset = vi.fn();
    const scheduler = createTurnstileRetryScheduler({ reset, ...timers });
    scheduler.onTimeout();
    scheduler.onSuccess();
    expect(timers.pending).toEqual([]);
    expect(scheduler.attempts()).toBe(0);
    scheduler.onError('600010');
    scheduler.cancel();
    expect(timers.pending).toEqual([]);
    expect(reset).not.toHaveBeenCalled();
  });
});

it('lets Cloudflare own retries and refreshes', () => {
  expect(SAFARI_SAFE_TURNSTILE_OPTIONS).toMatchObject({
    retry: 'auto',
    refreshExpired: 'auto',
    refreshTimeout: 'auto',
  });
});
