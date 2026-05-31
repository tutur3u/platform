import { describe, expect, it, vi } from 'vitest';
import { getAiMemorySettings, isAiMemoryEnabledForScope } from './settings';

function rpcClient(data: unknown, error: { message?: string } | null = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return {
    client: {
      schema: vi.fn(() => ({ rpc })),
    },
    rpc,
  };
}

describe('AI memory settings', () => {
  it('reads private RPC settings and product toggles', async () => {
    const { client, rpc } = rpcClient([
      {
        enabled: true,
        product_enabled: false,
        products: { mira: false },
      },
    ]);

    await expect(
      getAiMemorySettings({
        db: client,
        product: 'mira',
        userId: 'user-1',
        wsId: 'workspace-1',
      })
    ).resolves.toEqual({
      enabled: true,
      productEnabled: false,
      products: { mira: false },
    });
    expect(rpc).toHaveBeenCalledWith('get_ai_memory_settings', {
      p_product: 'mira',
      p_user_id: 'user-1',
      p_ws_id: 'workspace-1',
    });
  });

  it('fails open when settings lookup fails', async () => {
    const { client } = rpcClient(null, { message: 'temporarily unavailable' });

    await expect(
      isAiMemoryEnabledForScope({
        db: client,
        product: 'ai_chat',
        userId: 'user-1',
        wsId: 'workspace-1',
      })
    ).resolves.toBe(true);
  });
});
