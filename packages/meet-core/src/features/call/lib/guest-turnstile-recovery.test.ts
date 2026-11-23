// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createGuestTurnstileRecovery,
  dropFailedTurnstileScript,
  type GuestTurnstilePhase,
  type GuestTurnstileStallReason,
} from './guest-turnstile-recovery';

function setup(maxRetries = 2) {
  vi.useFakeTimers();
  const remount = vi.fn();
  const phases: GuestTurnstilePhase[] = [];
  const reasons: GuestTurnstileStallReason[] = [];
  const recovery = createGuestTurnstileRecovery({
    remount,
    setPhase: (phase) => phases.push(phase),
    setStallReason: (reason) => reasons.push(reason),
    maxRetries,
    baseDelayMs: 1000,
  });
  return { recovery, remount, phases, reasons };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  delete (window as { turnstile?: unknown }).turnstile;
});

describe('createGuestTurnstileRecovery', () => {
  it('never remounts synchronously and backs off between fresh widgets', () => {
    const { recovery, remount, phases } = setup();
    expect(recovery.onError('600010')).toBe(true);
    expect(remount).not.toHaveBeenCalled();
    expect(phases).toEqual(['retrying']);
    vi.advanceTimersByTime(1000);
    expect(remount).toHaveBeenCalledTimes(1);
    recovery.onStall('watchdog');
    vi.advanceTimersByTime(1999);
    expect(remount).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(remount).toHaveBeenCalledTimes(2);
  });

  it('stalls as blocked after the retry budget, so the fallback shows', () => {
    const { recovery, phases, reasons } = setup(1);
    recovery.onStall('script');
    vi.runAllTimers();
    recovery.onStall('timeout');
    expect(phases.at(-1)).toBe('stalled');
    expect(reasons).toEqual(['blocked']);
  });

  it('stalls immediately on unsupported browsers', () => {
    const { recovery, remount, phases, reasons } = setup();
    recovery.onUnsupported();
    vi.runAllTimers();
    expect(remount).not.toHaveBeenCalled();
    expect(phases).toEqual(['stalled']);
    expect(reasons).toEqual(['unsupported']);
  });

  it('stalls on permanent configuration errors without retrying', () => {
    const { recovery, remount, reasons } = setup();
    expect(recovery.onError('110100')).toBe(false);
    vi.runAllTimers();
    expect(remount).not.toHaveBeenCalled();
    expect(reasons).toEqual(['configuration']);
  });

  it('resets the budget after a success', () => {
    const { recovery, remount, phases } = setup(1);
    recovery.onError('300010');
    vi.runAllTimers();
    recovery.scheduler.onSuccess();
    recovery.onError('300010');
    vi.runAllTimers();
    expect(remount).toHaveBeenCalledTimes(2);
    expect(phases).not.toContain('stalled');
  });
});

describe('dropFailedTurnstileScript', () => {
  it('removes a script tag that never defined window.turnstile', () => {
    const script = document.createElement('script');
    script.id = 'cf-turnstile-script';
    document.head.append(script);
    expect(dropFailedTurnstileScript()).toBe(true);
    expect(document.getElementById('cf-turnstile-script')).toBeNull();
  });

  it('keeps a loaded script', () => {
    const script = document.createElement('script');
    script.id = 'cf-turnstile-script';
    document.head.append(script);
    (window as { turnstile?: unknown }).turnstile = {};
    expect(dropFailedTurnstileScript()).toBe(false);
    expect(document.getElementById('cf-turnstile-script')).not.toBeNull();
  });
});
