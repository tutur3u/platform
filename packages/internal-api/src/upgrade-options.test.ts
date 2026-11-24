import { describe, expect, it, vi } from 'vitest';
import { getWorkspaceUpgradeOptions } from './upgrade-options';

describe('getWorkspaceUpgradeOptions', () => {
  it('reads the encoded workspace upgrade options without caching', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ billingUrl: '', currentPlan: null, plans: [] }),
      ok: true,
      status: 200,
    });

    await getWorkspaceUpgradeOptions('workspace / one', {
      baseUrl: 'https://web.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://web.example.com/api/v1/workspaces/workspace%20%2F%20one/billing/upgrade-options',
      expect.objectContaining({ cache: 'no-store' })
    );
  });
});
