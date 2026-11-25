// @vitest-environment node
import {
  featureFlagCatalog,
  runtimeDefinitionRows,
} from '@tuturuuu/feature-flags';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), rpc: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureAdminRequest: mocks.authorize,
}));

const definitions = runtimeDefinitionRows(featureFlagCatalog.flags);
const summary = {
  status: 'synced',
  definitions: definitions.length,
  changed: 0,
};

function request(body?: unknown, authenticated = true) {
  return new Request(
    'https://infra.tuturuuu.com/api/v1/infrastructure/feature-flags/sync',
    {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: authenticated
        ? { Authorization: 'Bearer fixture-admin-token' }
        : {},
    }
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({
    ok: true,
    sbAdmin: { schema: () => ({ rpc: mocks.rpc }) },
  });
  mocks.rpc.mockResolvedValue({ data: summary, error: null });
});

describe('definition sync route', () => {
  it('requires permission in the root workspace and verified mutation intent', async () => {
    const input = request();
    mocks.authorize.mockResolvedValueOnce({
      ok: false,
      response: new Response(null, { status: 403 }),
    });
    expect((await POST(input)).status).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledWith(
      'manage_feature_flags',
      true,
      input
    );
    expect((await POST(request({}, false))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('syncs the code definitions and defaults to withholding widening acknowledgement', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(summary);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      'feature_flag_sync_definitions',
      {
        p_definitions: definitions,
        p_acknowledge_widening: false,
      }
    );
  });

  it('accepts an explicit boolean and maps a widening refusal to 409', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'feature_flag_definition_widens_control' },
    });
    expect((await POST(request({ acknowledgeWidening: false }))).status).toBe(
      409
    );
    expect((await POST(request({ acknowledgeWidening: true }))).status).toBe(
      200
    );
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      'feature_flag_sync_definitions',
      expect.objectContaining({ p_acknowledge_widening: true })
    );
    expect((await POST(request({ acknowledgeWidening: 'true' }))).status).toBe(
      400
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
});
