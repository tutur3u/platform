// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { readPlatformFeatureFlagState } from './platform-feature-flag-store';

vi.mock('server-only', () => ({}));

it('starts one non-blocking sync on read and logs a rejected sync', async () => {
  let rejectSync: (error: Error) => void = () => {};
  const background = new Promise<never>((_resolve, reject) => {
    rejectSync = reject;
  });
  const rpc = vi.fn((name: string) =>
    name === 'feature_flag_sync_definitions'
      ? background
      : Promise.resolve({ data: [], error: null })
  );
  const input = { actorId: 'test-actor', admin: { schema: () => ({ rpc }) } };
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const reads = await Promise.all([
      readPlatformFeatureFlagState(input),
      readPlatformFeatureFlagState(input),
    ]);
    expect(reads).toEqual([
      { status: 'ready', overrides: [] },
      { status: 'ready', overrides: [] },
    ]);
    expect(
      rpc.mock.calls.filter(
        ([name]) => name === 'feature_flag_sync_definitions'
      )
    ).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith(
      'feature_flag_sync_definitions',
      expect.objectContaining({ p_acknowledge_widening: false })
    );
    rejectSync(new Error('unavailable'));
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
  } finally {
    warn.mockRestore();
  }
});
