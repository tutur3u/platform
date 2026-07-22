import { describe, expect, it, vi } from 'vitest';
import { getWorkspaceAiCreditStatus } from './settings';

describe('workspace settings API', () => {
  it('loads AI credit status from the same-origin workspace API', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            included: { remaining: 80, totalAllocated: 100, totalUsed: 20 },
            payg: {
              nextExpiry: null,
              remaining: 0,
              totalGranted: 0,
              totalUsed: 0,
            },
            percentUsed: 20,
            remaining: 80,
            tier: 'PRO',
            totalAllocated: 100,
            totalUsed: 20,
          })
        )
    );

    const result = await getWorkspaceAiCreditStatus('workspace / one', {
      baseUrl: 'https://tasks.example.com',
      fetch: fetchMock,
    });

    expect(result.tier).toBe('PRO');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tasks.example.com/api/v1/workspaces/workspace%20%2F%20one/ai/credits',
      expect.objectContaining({ cache: 'no-store' })
    );
  });
});
