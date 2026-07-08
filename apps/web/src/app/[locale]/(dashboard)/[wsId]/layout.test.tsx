import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getDashboardLayoutData: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/server', () => ({
  connection: (...args: Parameters<typeof mocks.connection>) =>
    mocks.connection(...args),
}));

vi.mock('next/navigation', () => ({
  notFound: (...args: Parameters<typeof mocks.notFound>) =>
    mocks.notFound(...args),
  redirect: (...args: Parameters<typeof mocks.redirect>) =>
    mocks.redirect(...args),
}));

vi.mock('./layout-data', () => ({
  getDashboardLayoutData: (
    ...args: Parameters<typeof mocks.getDashboardLayoutData>
  ) => mocks.getDashboardLayoutData(...args),
}));

vi.mock('@/constants/env', () => ({
  PROD_MODE: false,
}));

import Layout from './layout';

describe('[wsId] dashboard layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.getDashboardLayoutData.mockResolvedValue({
      user: null,
      workspace: null,
    });
    mocks.redirect.mockImplementation((url: string) => {
      throw new Error(`redirect:${url}`);
    });
  });

  it('opts the authenticated dashboard shell out of prerendering before auth loading', async () => {
    const callOrder: string[] = [];
    mocks.connection.mockImplementation(async () => {
      callOrder.push('connection');
    });
    mocks.getDashboardLayoutData.mockImplementation(async () => {
      callOrder.push('layout-data');

      return {
        user: null,
        workspace: null,
      };
    });

    await expect(
      Layout({
        children: <div data-testid="dashboard-child" />,
        params: Promise.resolve({ wsId: 'personal' }),
      })
    ).rejects.toThrow('redirect:/login');

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.getDashboardLayoutData).toHaveBeenCalledWith('personal');
    expect(callOrder).toEqual(['connection', 'layout-data']);
  });
});
