import { describe, expect, it, vi } from 'vitest';
import {
  createReceiveRecovery,
  RECEIVE_HEALTHY_RESET_MS,
  RECEIVE_RETRY_CAP,
  RECEIVE_RETRY_DELAYS_MS,
} from './receive-recovery';

function fixture() {
  let now = 1_000_000;
  const rebuild = vi.fn();
  const onStatus = vi.fn();
  const recovery = createReceiveRecovery({
    rebuild,
    onStatus,
    clock: () => now,
  });
  return {
    rebuild,
    onStatus,
    recovery,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('automatic incoming video recovery', () => {
  it('rebuilds at once, then backs off between attempts', () => {
    const { recovery, rebuild, advance } = fixture();
    recovery.stalled();
    expect(rebuild).toHaveBeenCalledTimes(1);
    recovery.stalled();
    advance(RECEIVE_RETRY_DELAYS_MS[1]! - 1);
    recovery.stalled();
    expect(rebuild).toHaveBeenCalledTimes(1);
    advance(1);
    recovery.stalled();
    expect(rebuild).toHaveBeenCalledTimes(2);
    advance(RECEIVE_RETRY_DELAYS_MS[2]!);
    recovery.stalled();
    expect(rebuild).toHaveBeenCalledTimes(3);
  });

  it('caps the attempts and then shows a quiet status without more rebuilds', () => {
    const { recovery, rebuild, onStatus, advance } = fixture();
    for (let i = 0; i < RECEIVE_RETRY_CAP; i++) {
      advance(RECEIVE_RETRY_DELAYS_MS[i]!);
      recovery.stalled();
    }
    expect(rebuild).toHaveBeenCalledTimes(RECEIVE_RETRY_CAP);
    expect(onStatus).not.toHaveBeenCalled();
    advance(10 * 60_000);
    recovery.stalled();
    recovery.stalled();
    expect(rebuild).toHaveBeenCalledTimes(RECEIVE_RETRY_CAP);
    expect(onStatus).toHaveBeenCalledOnce();
    expect(onStatus).toHaveBeenCalledWith('unavailable');
  });

  it('clears the status and the count after sustained health', () => {
    const { recovery, rebuild, onStatus, advance } = fixture();
    for (let i = 0; i < RECEIVE_RETRY_CAP; i++) {
      advance(RECEIVE_RETRY_DELAYS_MS[i]!);
      recovery.stalled();
    }
    recovery.stalled();
    recovery.healthy();
    advance(RECEIVE_HEALTHY_RESET_MS - 1);
    recovery.healthy();
    expect(recovery.attempts()).toBe(RECEIVE_RETRY_CAP);
    advance(1);
    recovery.healthy();
    expect(recovery.attempts()).toBe(0);
    expect(onStatus).toHaveBeenLastCalledWith('ok');
    recovery.stalled();
    expect(rebuild).toHaveBeenCalledTimes(RECEIVE_RETRY_CAP + 1);
  });

  it('retries from scratch when the browser reports the network is back', () => {
    const { recovery, rebuild, onStatus, advance } = fixture();
    for (let i = 0; i < RECEIVE_RETRY_CAP; i++) {
      advance(RECEIVE_RETRY_DELAYS_MS[i]!);
      recovery.stalled();
    }
    recovery.stalled();
    recovery.retryNow();
    expect(onStatus).toHaveBeenLastCalledWith('ok');
    recovery.stalled();
    expect(rebuild).toHaveBeenCalledTimes(RECEIVE_RETRY_CAP + 1);
  });

  it('a stall interrupts a healthy streak', () => {
    const { recovery, advance } = fixture();
    recovery.healthy();
    advance(RECEIVE_HEALTHY_RESET_MS - 1);
    recovery.stalled();
    advance(2);
    recovery.healthy();
    expect(recovery.attempts()).toBe(1);
  });
});
