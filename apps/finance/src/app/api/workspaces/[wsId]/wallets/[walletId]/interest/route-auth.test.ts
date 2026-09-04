import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calculateGET: vi.fn(),
  configDELETE: vi.fn(),
  configPUT: vi.fn(),
  interestGET: vi.fn(),
  interestPOST: vi.fn(),
  projectGET: vi.fn(),
  ratesGET: vi.fn(),
  ratesPOST: vi.fn(),
  resolveFinanceRouteAuthContext: vi.fn(),
}));

vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: mocks.resolveFinanceRouteAuthContext,
}));
vi.mock('@tuturuuu/apis/finance/wallets/walletId/interest/route', () => ({
  GET: mocks.interestGET,
  POST: mocks.interestPOST,
}));
vi.mock(
  '@tuturuuu/apis/finance/wallets/walletId/interest/calculate/route',
  () => ({ GET: mocks.calculateGET })
);
vi.mock(
  '@tuturuuu/apis/finance/wallets/walletId/interest/project/route',
  () => ({ GET: mocks.projectGET })
);
vi.mock(
  '@tuturuuu/apis/finance/wallets/walletId/interest/config/route',
  () => ({ DELETE: mocks.configDELETE, PUT: mocks.configPUT })
);
vi.mock('@tuturuuu/apis/finance/wallets/walletId/interest/rates/route', () => ({
  GET: mocks.ratesGET,
  POST: mocks.ratesPOST,
}));

import * as calculateRoute from './calculate/route';
import * as configRoute from './config/route';
import * as projectRoute from './project/route';
import * as ratesRoute from './rates/route';
import * as interestRoute from './route';

describe('Finance wallet interest route auth', () => {
  const authContext = { actor: 'finance-member' };
  const context = {
    params: Promise.resolve({ walletId: 'wallet-id', wsId: 'workspace-id' }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveFinanceRouteAuthContext.mockResolvedValue(authContext);
  });

  it.each([
    ['summary GET', interestRoute.GET, mocks.interestGET],
    ['summary POST', interestRoute.POST, mocks.interestPOST],
    ['calculate GET', calculateRoute.GET, mocks.calculateGET],
    ['project GET', projectRoute.GET, mocks.projectGET],
    ['config PUT', configRoute.PUT, mocks.configPUT],
    ['config DELETE', configRoute.DELETE, mocks.configDELETE],
    ['rates GET', ratesRoute.GET, mocks.ratesGET],
    ['rates POST', ratesRoute.POST, mocks.ratesPOST],
  ])('forwards verified app-session auth for %s', async (_, route, handler) => {
    const request = new Request('https://finance.example/api/interest');
    handler.mockResolvedValue(new Response(null, { status: 204 }));

    const response = await route(request, context);

    expect(response.status).toBe(204);
    expect(mocks.resolveFinanceRouteAuthContext).toHaveBeenCalledWith(request);
    expect(handler).toHaveBeenCalledWith(request, context, authContext);
  });
});
