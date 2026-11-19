import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fleetSmokeEmail,
  fleetSmokeTotp,
} from '@/lib/auth/fleet-smoke/identity';

const fixtures = vi.hoisted(() => ({
  createAdmin: vi.fn(),
  createAuth: vi.fn(),
  rpc: vi.fn(),
  log: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: fixtures.createAdmin,
}));
vi.mock('@tuturuuu/supabase/next/common', () => ({
  checkEnvVariables: () => ({ url: 'https://auth.invalid', key: 'anon' }),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: fixtures.createAuth }));
import { DELETE, GET, POST } from './route';

const origin = 'https://fixture.invalid';
const token = 'a'.repeat(43);
const password = 'b'.repeat(43);
const requestId = 'b6aa3b56-1582-44e3-83c5-c67a67227c8e';
const workspaceId = '24bdfbf2-ede4-4c8c-9e8d-4418679648ad';
const factorId = '62cbbc4d-20ff-46e5-9018-a1c71d9b31f1';
const seed = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const pending = {
  requestId,
  state: 'pending',
  workspaceId: null,
  activatedAt: null,
  previousId: null,
};
const active = { ...pending, state: 'active', workspaceId };

function request({
  method = 'POST',
  credential = token,
  requestOrigin = origin,
  id = requestId,
  body = password,
} = {}) {
  const url = new URL('/api/v1/auth/fleet-smoke', requestOrigin);
  return Object.assign(
    new Request(url, {
      method,
      headers: {
        authorization: `Bearer ${credential}`,
        'x-fleet-smoke-request-id': id,
      },
      ...(method === 'POST' ? { body } : {}),
    }),
    { nextUrl: url }
  ) as NextRequest;
}

beforeEach(() => {
  vi.stubEnv('TUTURUUU_FLEET_SMOKE_PROVISIONER_TOKEN', token);
  vi.stubEnv('TUTURUUU_FLEET_SMOKE_PROVISIONER_ORIGIN', origin);
  vi.stubEnv(
    'TUTURUUU_FLEET_SMOKE_PROVISIONER_EXPIRES_AT',
    new Date(Date.now() + 60_000).toISOString()
  );
  vi.spyOn(console, 'warn').mockImplementation(fixtures.log);
  fixtures.createAdmin.mockResolvedValue({
    schema: () => ({ rpc: fixtures.rpc }),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('fleet smoke provisioner', () => {
  it('denies mismatched credentials, wrong origins, and disabled or expired configuration without touching the database', async () => {
    expect((await POST(request({ credential: 'c'.repeat(43) }))).status).toBe(
      404
    );
    expect(
      (await POST(request({ requestOrigin: 'https://other.invalid' }))).status
    ).toBe(404);
    vi.stubEnv(
      'TUTURUUU_FLEET_SMOKE_PROVISIONER_EXPIRES_AT',
      new Date(0).toISOString()
    );
    expect((await POST(request())).status).toBe(404);
    vi.stubEnv('TUTURUUU_FLEET_SMOKE_PROVISIONER_EXPIRES_AT', undefined);
    expect((await POST(request())).status).toBe(404);
    expect(fixtures.createAdmin).not.toHaveBeenCalled();
  });

  it('bounds the submitted password and rejects invalid request IDs before reservation', async () => {
    expect((await POST(request({ body: 'a'.repeat(65) }))).status).toBe(400);
    expect((await POST(request({ id: 'someone@example.com' }))).status).toBe(
      400
    );
    expect(fixtures.createAdmin).not.toHaveBeenCalled();
  });

  it('does not repeat an already reserved mutation', async () => {
    fixtures.rpc.mockResolvedValue({ data: null });
    expect((await POST(request())).status).toBe(409);
    expect(fixtures.rpc).toHaveBeenCalledExactlyOnceWith(
      'fleet_smoke_transition',
      {
        p_id: requestId,
        p_action: 'reserve',
      }
    );
    expect(fixtures.createAuth).not.toHaveBeenCalled();
  });

  it('returns redacted readback and can retire the exact operation', async () => {
    fixtures.rpc.mockResolvedValueOnce({ data: active });
    fixtures.rpc.mockResolvedValueOnce({ data: active });
    fixtures.rpc.mockResolvedValueOnce({
      data: { ...active, state: 'retired' },
    });
    expect(await (await GET(request({ method: 'GET' }))).json()).toEqual(
      active
    );
    expect(await (await GET(request({ method: 'HEAD' }))).json()).toEqual(
      active
    );
    expect(await (await DELETE(request({ method: 'DELETE' }))).json()).toEqual({
      ...active,
      state: 'retired',
    });
    expect(
      fixtures.rpc.mock.calls.map(([, params]) => params.p_action)
    ).toEqual(['read', 'read', 'retire']);
  });

  it.each([false, true])(
    'activates only after verified TOTP and credential setup (verification fails: %s)',
    async (failVerification) => {
      const createUser = vi
        .fn()
        .mockResolvedValue({ data: { user: { id: requestId } } });
      const updateUser = vi.fn().mockResolvedValue({});
      const verify = vi
        .fn()
        .mockResolvedValue(
          failVerification ? { error: new Error(password) } : {}
        );
      const signOut = vi.fn().mockResolvedValue({});
      fixtures.createAdmin.mockResolvedValue({
        schema: () => ({ rpc: fixtures.rpc }),
        auth: { admin: { createUser, updateUserById: updateUser } },
        from: () => ({ upsert: vi.fn().mockResolvedValue({}) }),
      });
      fixtures.createAuth.mockReturnValue({
        auth: {
          signInWithPassword: vi
            .fn()
            .mockResolvedValue({ data: { user: { id: requestId } } }),
          signOut,
          mfa: {
            enroll: vi.fn().mockResolvedValue({
              data: { id: factorId, totp: { secret: seed } },
            }),
            challengeAndVerify: verify,
          },
        },
      });
      fixtures.rpc
        .mockResolvedValueOnce({ data: pending })
        .mockResolvedValueOnce({ data: active });
      const response = await POST(request());
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(createUser.mock.calls[0]?.[0]).toMatchObject({
        id: requestId,
        email: fleetSmokeEmail(requestId),
        app_metadata: {
          tuturuuu_fleet_smoke: true,
          tuturuuu_required_mfa: { recoveryInProgress: true },
        },
      });
      expect(createUser.mock.calls[0]?.[0].password).not.toBe(password);
      expect(verify).toHaveBeenCalledWith({
        factorId,
        code: expect.stringMatching(/^\d{6}$/u),
      });
      if (failVerification) {
        expect(response.status).toBe(503);
        expect(await response.text()).not.toContain(password);
        expect(fixtures.log).toHaveBeenCalledExactlyOnceWith(
          '[fleet-smoke] Reconcile operation before continuing',
          requestId
        );
        expect(updateUser).not.toHaveBeenCalled();
        expect(fixtures.rpc).toHaveBeenCalledTimes(1);
      } else {
        expect(response.status).toBe(201);
        expect(await response.json()).toEqual({
          ...active,
          email: fleetSmokeEmail(requestId),
          totpSecret: seed,
        });
        expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
        expect(updateUser).toHaveBeenCalledWith(requestId, { password });
        expect(fixtures.rpc).toHaveBeenLastCalledWith(
          'fleet_smoke_transition',
          {
            p_id: requestId,
            p_action: 'activate',
            p_factor: factorId,
          }
        );
      }
    }
  );
});

it('matches the six-digit truncation of the RFC 6238 SHA-1 test vector', () => {
  expect(fleetSmokeTotp(seed, 59_000)).toBe('287082');
});
