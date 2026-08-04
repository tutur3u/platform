import { describe, expect, it, vi } from 'vitest';
import { runLiveSessionAction } from './control-tray';

describe('runLiveSessionAction', () => {
  it('ends an active session', async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const onRestartSession = vi.fn().mockResolvedValue(undefined);

    await runLiveSessionAction({
      connected: true,
      disconnect,
      onRestartSession,
    });

    expect(disconnect).toHaveBeenCalledOnce();
    expect(onRestartSession).not.toHaveBeenCalled();
  });

  it('requests a new authorization after an ended session', async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const onRestartSession = vi.fn().mockResolvedValue(undefined);

    await runLiveSessionAction({
      connected: false,
      disconnect,
      onRestartSession,
    });

    expect(onRestartSession).toHaveBeenCalledOnce();
    expect(disconnect).not.toHaveBeenCalled();
  });
});
