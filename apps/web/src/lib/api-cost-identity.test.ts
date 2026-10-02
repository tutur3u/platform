// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  provider: vi.fn(),
  app: vi.fn(),
  reserve: vi.fn(),
  key: vi.fn(),
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  APP_SESSION_SCOPE: 'internal-app:session',
  verifyAppSessionRequest: mocks.app,
}));
vi.mock('@tuturuuu/auth/supabase-session-user', () => ({
  resolveSupabaseSessionRequest: mocks.provider,
}));

vi.mock('@tuturuuu/storage-core/security-budget', () => ({
  reserveSecurityBudget: mocks.reserve,
}));

vi.mock('@tuturuuu/auth/api-keys', () => ({ validateApiKey: mocks.key }));

import {
  resolveApiCostIdentity,
  resolveApiCostUserId,
} from './api-cost-identity';

beforeEach(() => {
  mocks.key.mockReset();
  mocks.reserve.mockReset().mockResolvedValue([1, 0]);
  mocks.provider.mockReset();
  mocks.app.mockReset().mockReturnValue({ ok: false });
});
it('never trusts claimed user/plan headers or unverified JWT subjects', async () => {
  expect(
    await resolveApiCostUserId(
      new NextRequest('https://example.test/api', {
        headers: { 'x-user-id': 'paid-user', 'x-plan': 'PRO' },
      })
    )
  ).toBeUndefined();
  mocks.provider.mockResolvedValue({
    user: null,
    authError: new Error('invalid'),
  });
  expect(
    await resolveApiCostUserId(
      new NextRequest('https://example.test/api', {
        headers: { authorization: 'Bearer eyJ.fake' },
      })
    )
  ).toBeUndefined();
});
it('uses provider revalidation and signed app-session audience verification', async () => {
  mocks.provider.mockResolvedValue({
    user: { id: 'verified' },
    authError: null,
  });
  expect(
    await resolveApiCostUserId(
      new NextRequest('https://example.test/api', {
        headers: { authorization: 'Bearer eyJ.token' },
      })
    )
  ).toBe('verified');
  mocks.app.mockReturnValue({ ok: true, claims: { sub: 'verified-app' } });
  expect(
    await resolveApiCostUserId(
      new NextRequest('https://example.test/api', {
        headers: { authorization: 'Bearer ttr_app_test' },
      })
    )
  ).toBe('verified-app');
  expect(mocks.app).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({
      targetApp: expect.arrayContaining(['platform', 'cms', 'drive']),
      requiredScope: 'internal-app:session',
    })
  );
});

it('never grants a machine plan from an unvalidated workspace or API key', async () => {
  mocks.key.mockResolvedValueOnce(null);
  expect(
    await resolveApiCostIdentity(
      new NextRequest('https://example.test/api', {
        headers: { authorization: 'Bearer ttr_test_only_invalid' },
      })
    )
  ).toEqual({});
  mocks.key.mockResolvedValueOnce({
    wsId: 'verified-workspace',
    keyId: 'verified-key',
  });
  const request = new NextRequest('https://example.test/api', {
    headers: { authorization: 'Bearer ttr_test_only_valid' },
  });
  expect(await resolveApiCostIdentity(request)).toEqual({
    workspaceId: 'verified-workspace',
    keyId: 'verified-key',
  });
  await resolveApiCostIdentity(request);
  expect(mocks.key).toHaveBeenCalledTimes(2);
});
