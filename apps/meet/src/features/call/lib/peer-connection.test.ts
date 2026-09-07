import { afterEach, expect, it, vi } from 'vitest';
import { waitForPeerConnection } from './peer-connection';

function peer(initial: RTCPeerConnectionState) {
  const pc = new EventTarget() as RTCPeerConnection;
  let state = initial;
  Object.defineProperty(pc, 'connectionState', { get: () => state });
  return {
    pc,
    transition(next: RTCPeerConnectionState) {
      state = next;
      pc.dispatchEvent(new Event('connectionstatechange'));
    },
  };
}
afterEach(() => vi.useRealTimers());

it('holds the next SFU operation until a slow initial connection completes', async () => {
  vi.useFakeTimers();
  const f = peer('connecting');
  const operation = vi.fn();
  const pending = waitForPeerConnection(f.pc).then(operation);
  await vi.advanceTimersByTimeAsync(6000);
  expect(operation).not.toHaveBeenCalled();
  f.transition('connected');
  await pending;
  expect(operation).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('does not delay an established session', async () => {
  await expect(
    waitForPeerConnection(peer('connected').pc)
  ).resolves.toBeUndefined();
});

it('rejects promptly when a connection is closed during the wait', async () => {
  const f = peer('connecting');
  const pending = expect(waitForPeerConnection(f.pc)).rejects.toThrow(
    'sfu_connection_failed'
  );
  f.transition('closed');
  await pending;
});

it('bounds a stalled connection and removes its listener', async () => {
  vi.useFakeTimers();
  const f = peer('connecting');
  const remove = vi.spyOn(f.pc, 'removeEventListener');
  const pending = expect(waitForPeerConnection(f.pc)).rejects.toThrow(
    'sfu_connection_timeout'
  );
  await vi.advanceTimersByTimeAsync(12_000);
  await pending;
  expect(remove).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
