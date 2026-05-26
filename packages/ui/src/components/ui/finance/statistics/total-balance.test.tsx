import { describe, expect, it, vi } from 'vitest';
import TotalBalanceStatistics from './total-balance';

const mocks = vi.hoisted(() => ({
  containsPermission: vi.fn(),
  createClient: vi.fn(),
  getPermissions: vi.fn(),
  getTranslations: vi.fn(),
  rpc: vi.fn(),
  statisticCard: vi.fn(),
}));

vi.mock('@tuturuuu/icons', () => ({
  Wallet: (props: Record<string, unknown>) => (
    <svg data-testid="wallet" {...props} />
  ),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: (...args: Parameters<typeof mocks.getTranslations>) =>
    mocks.getTranslations(...args),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('notFound');
  }),
}));

vi.mock('@tuturuuu/ui/finance/statistics/card', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.statisticCard(props);
    return <div data-testid="statistic-card" />;
  },
}));

describe('TotalBalanceStatistics', () => {
  it('gets the net total from a single database RPC', async () => {
    mocks.createClient.mockResolvedValue({
      rpc: mocks.rpc,
    });
    mocks.rpc.mockResolvedValue({ data: 125000 });
    mocks.containsPermission.mockReturnValue(true);
    mocks.getPermissions.mockResolvedValue({
      containsPermission: mocks.containsPermission,
    });
    mocks.getTranslations.mockResolvedValue((key: string) => key);

    const result = await TotalBalanceStatistics({
      wsId: 'ws-1',
      currency: 'VND',
      searchParams: {
        view: 'month',
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        includeConfidential: 'false',
      },
    });

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('get_workspace_wallets_net_total', {
      ws_id: 'ws-1',
      start_date: expect.any(String),
      end_date: expect.any(String),
      include_confidential: false,
    });
    expect((result as { props: { value: unknown } }).props.value).toBe(125000);
  });
});
