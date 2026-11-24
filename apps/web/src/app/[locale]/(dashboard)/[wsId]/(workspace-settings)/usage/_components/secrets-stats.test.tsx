import { beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => vi.fn());
vi.mock('@/legacy-api-routes/workspaces/[wsId]/secrets/access', () => ({
  getWorkspaceSecretsAccess: access,
}));
vi.mock('@/components/cards/StatisticCard', () => ({ default: () => null }));

import { SecretsStats } from './secrets-stats';

function client(count: number | null) {
  const eq = vi.fn(async () => ({ count }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { db: { from }, from, select, eq };
}

describe('SecretsStats', () => {
  beforeEach(() => access.mockReset());

  it('hides the count when the Secrets access rule denies the viewer', async () => {
    access.mockResolvedValue({ allowed: false, status: 403, message: 'no' });
    const card = await SecretsStats({ wsId: 'ws-1' });
    expect(access).toHaveBeenCalledWith('ws-1');
    expect(card.props).toEqual({
      title: 'Secrets',
      value: '***',
      className: 'opacity-50',
    });
  });

  it('counts head-only through the client the access rule returns', async () => {
    const mock = client(3);
    access.mockResolvedValue({
      allowed: true,
      db: mock.db,
      resolvedWsId: 'resolved-ws',
    });
    const card = await SecretsStats({ wsId: 'ws-1' });
    expect(mock.from).toHaveBeenCalledWith('workspace_secrets');
    expect(mock.select).toHaveBeenCalledWith('*', {
      count: 'exact',
      head: true,
    });
    expect(mock.eq).toHaveBeenCalledWith('ws_id', 'resolved-ws');
    expect(card.props).toEqual({ title: 'Secrets', value: 3 });
  });

  it('shows zero when the count is unavailable', async () => {
    const mock = client(null);
    access.mockResolvedValue({
      allowed: true,
      db: mock.db,
      resolvedWsId: 'ws-1',
    });
    expect((await SecretsStats({ wsId: 'ws-1' })).props.value).toBe(0);
  });
});
