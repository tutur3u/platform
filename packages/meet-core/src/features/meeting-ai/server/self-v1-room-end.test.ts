import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  stop: vi.fn(),
  closeDrained: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('./self-v1-rpc', async (original) => ({
  ...(await original<object>()),
  selfRpc: { stopSession: mocks.stop, closeDrained: mocks.closeDrained },
}));

import { endSessionForRoom } from './self-v1-room-end';

function db(row: unknown) {
  const chain: Record<string, unknown> = {};
  for (const key of ['select', 'eq']) chain[key] = () => chain;
  chain.maybeSingle = async () => ({ data: row, error: null });
  return { from: () => chain } as never;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.stop.mockResolvedValue({});
  mocks.closeDrained.mockResolvedValue({});
});

describe('room end entry', () => {
  it('stops a live session hard for its own host and closes it', async () => {
    expect(
      await endSessionForRoom(
        db({ id: 's', user_id: 'host', capture_state: 'active' }),
        's'
      )
    ).toBe(true);
    expect(mocks.stop).toHaveBeenCalledWith(expect.anything(), {
      sessionId: 's',
      hostId: 'host',
      hard: true,
    });
    expect(mocks.closeDrained).toHaveBeenCalledWith(expect.anything(), 's');
  });

  it('is a no-op for a closed or missing session', async () => {
    expect(
      await endSessionForRoom(
        db({ id: 's', user_id: 'host', capture_state: 'closed' }),
        's'
      )
    ).toBe(false);
    expect(await endSessionForRoom(db(null), 's')).toBe(false);
    expect(mocks.stop).not.toHaveBeenCalled();
  });
});
