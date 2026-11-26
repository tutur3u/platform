import { beforeEach, expect, it, vi } from 'vitest';
import { meetEventNetworkAllowed } from './guest-event-network';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), proxy: vi.fn() }));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock('@tuturuuu/utils/abuse-protection/edge', () => ({
  hasRequiredProxyIpBlock: mocks.proxy,
}));

beforeEach(() => {
  mocks.proxy.mockReset().mockResolvedValue(false);
  mocks.rpc.mockReset().mockResolvedValue({ data: [], error: null });
});

it('checks the exact address and the IPv6 prefix in both block stores', async () => {
  const ip = '2001:db8::123';
  expect(await meetEventNetworkAllowed(ip)).toBe(true);
  expect(mocks.proxy).toHaveBeenCalledWith(ip);
  expect(mocks.proxy).toHaveBeenCalledWith('2001:db8:0:0::/64');
  expect(mocks.rpc).toHaveBeenCalledWith('get_active_ip_block', {
    p_ip_address: '2001:db8:0:0::/64',
  });
});

it('refuses missing provenance and unavailable or blocked stores', async () => {
  expect(await meetEventNetworkAllowed(undefined)).toBe(false);
  mocks.proxy.mockRejectedValueOnce(new Error('store unavailable'));
  expect(await meetEventNetworkAllowed('203.0.113.4')).toBe(false);
  mocks.rpc.mockResolvedValueOnce({
    data: null,
    error: new Error('RPC unavailable'),
  });
  expect(await meetEventNetworkAllowed('203.0.113.4')).toBe(false);
  mocks.proxy.mockResolvedValueOnce(true);
  expect(await meetEventNetworkAllowed('203.0.113.4')).toBe(false);
  mocks.rpc.mockResolvedValueOnce({ data: [{ id: 'blocked' }], error: null });
  expect(await meetEventNetworkAllowed('203.0.113.4')).toBe(false);
});
