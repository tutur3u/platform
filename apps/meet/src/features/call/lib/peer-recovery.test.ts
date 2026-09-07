import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchPeerRecovery } from './peer-recovery';

class Peer extends EventTarget {
  connectionState: RTCPeerConnectionState = 'new';
  change(state: RTCPeerConnectionState) {
    this.connectionState = state;
    this.dispatchEvent(new Event('connectionstatechange'));
  }
}

describe('media connection recovery', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('recovers a failed media peer even when signaling remains connected', () => {
    const peer = new Peer();
    const recover = vi.fn();
    watchPeerRecovery(
      peer as unknown as RTCPeerConnection,
      () => true,
      recover
    );
    peer.change('failed');
    vi.advanceTimersByTime(1000);
    expect(recover).toHaveBeenCalledTimes(1);
    peer.change('failed');
    vi.advanceTimersByTime(20_000);
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it('allows transient disconnection to recover without replacing the peer', () => {
    const peer = new Peer();
    const recover = vi.fn();
    watchPeerRecovery(
      peer as unknown as RTCPeerConnection,
      () => true,
      recover
    );
    peer.change('disconnected');
    vi.advanceTimersByTime(9000);
    peer.change('connected');
    vi.advanceTimersByTime(20_000);
    expect(recover).not.toHaveBeenCalled();
    peer.change('disconnected');
    vi.advanceTimersByTime(10_000);
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it('rebuilds a connection whose handshake never completes', () => {
    const peer = new Peer();
    const recover = vi.fn();
    watchPeerRecovery(
      peer as unknown as RTCPeerConnection,
      () => true,
      recover
    );
    peer.change('connecting');
    vi.advanceTimersByTime(20_000);
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it('does not let an obsolete or closed peer reset its replacement', () => {
    const peer = new Peer();
    const recover = vi.fn();
    let current = true;
    watchPeerRecovery(
      peer as unknown as RTCPeerConnection,
      () => current,
      recover
    );
    peer.change('failed');
    current = false;
    vi.advanceTimersByTime(1000);
    expect(recover).not.toHaveBeenCalled();
    current = true;
    peer.change('disconnected');
    peer.change('closed');
    vi.advanceTimersByTime(20_000);
    expect(recover).not.toHaveBeenCalled();
  });
});
