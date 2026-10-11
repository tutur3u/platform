import '../copy-auth.test-fixture';
import { expect, it } from 'vitest';
import {
  FINANCE_TRANSACTION_STORAGE_APP_SESSION_TARGETS,
  resolveWorkspaceStorageRouteAuth,
} from '@/legacy-api-routes/v1/workspaces/[wsId]/storage/route-auth';
import {
  finalizeBody,
  mocks,
  params,
  request,
  workspaceId,
} from '../copy-auth.test-fixture';
import { POST } from './route';

it('revalidates signed actor/workspace permission and the exact provider object', async () => {
  expect(
    (await POST(request('finalize-upload', finalizeBody), params)).status
  ).toBe(200);
  expect(mocks.metadata).toHaveBeenCalledWith(
    workspaceId,
    'r2',
    finalizeBody.path
  );
  expect(mocks.finalize).toHaveBeenCalledTimes(1);
});
it.each(['drive', 'finance', 'platform', 'calendar'] as const)(
  'rejects signed %s sessions without object access',
  async (target) => {
    expect(
      (await POST(request('finalize-upload', finalizeBody, target), params))
        .status
    ).toBe(401);
    expect(mocks.metadata).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
  }
);
it.each(['membership', 'permission', 'workspace', 'actor'])(
  'denies %s before object access',
  async (reason) => {
    if (reason === 'membership') mocks.member = false;
    if (reason === 'permission') mocks.manage = false;
    const p =
      reason === 'workspace'
        ? { params: Promise.resolve({ wsId: 'foreign' }) }
        : params;
    const body =
      reason === 'actor'
        ? { ...finalizeBody, expectedActor: workspaceId }
        : finalizeBody;
    expect([401, 403, 409]).toContain(
      (await POST(request('finalize-upload', body), p)).status
    );
    expect(mocks.metadata).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
  }
);
it.each([
  { path: '../private' },
  { path: 'Lettin/foreign.json' },
  { originalFilename: 'other.json' },
  { contentType: 'text/plain' },
  { provider: 'unknown' },
  { unexpected: true },
])('rejects unscoped finalization %j', async (delta) => {
  expect(
    (
      await POST(
        request('finalize-upload', { ...finalizeBody, ...delta }),
        params
      )
    ).status
  ).toBe(400);
  expect(mocks.metadata).not.toHaveBeenCalled();
});
it('does not finalize after a provider change or unavailable backend', async () => {
  mocks.provider.mockResolvedValue({
    provider: 'supabase',
    misconfigured: false,
  });
  expect(
    (await POST(request('finalize-upload', finalizeBody), params)).status
  ).toBe(409);
  mocks.provider.mockResolvedValue({ provider: 'r2', misconfigured: true });
  expect(
    (await POST(request('finalize-upload', finalizeBody), params)).status
  ).toBe(409);
  expect(mocks.metadata).not.toHaveBeenCalled();
  expect(mocks.finalize).not.toHaveBeenCalled();
});
it.each([
  { size: 10485761 },
  { size: 0 },
  { contentType: 'application/zip' },
  { provider: 'supabase' },
  { path: 'Lettin/other.json' },
])('denies invalid actual object metadata %j', async (delta) => {
  const metadata = await mocks.metadata();
  mocks.metadata.mockResolvedValue({ ...metadata, ...delta });
  expect(
    (await POST(request('finalize-upload', finalizeBody), params)).status
  ).toBe(409);
  expect(mocks.finalize).not.toHaveBeenCalled();
});
it('keeps missing objects and finalization errors unconfirmed', async () => {
  mocks.metadata.mockRejectedValue(new Error('Object unavailable'));
  expect(
    (await POST(request('finalize-upload', finalizeBody), params)).status
  ).toBe(500);
  expect(mocks.finalize).not.toHaveBeenCalled();
});

it('keeps the production generic storage auth resolver closed to Lettin tokens', async () => {
  const auth = await resolveWorkspaceStorageRouteAuth(
    request('finalize-upload', finalizeBody),
    workspaceId,
    {
      appSessionTargets: FINANCE_TRANSACTION_STORAGE_APP_SESSION_TARGETS,
    }
  );
  expect(auth.ok).toBe(false);
  if (!auth.ok) expect(auth.response.status).toBe(401);
  expect(mocks.supabaseFallback).not.toHaveBeenCalled();
  expect(mocks.permissions).not.toHaveBeenCalled();
});
