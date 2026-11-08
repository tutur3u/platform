import { NextRequest } from 'next/server';
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const f = vi.hoisted(() => ({ getUserById: vi.fn(), from: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: { admin: { getUserById: f.getUserById } },
  }),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (req: Request, auth: unknown, params: unknown) => unknown) =>
    (req: Request) =>
      handler(
        req,
        {
          user: { id: 'actor', email: 'staff@tuturuuu.com' },
          supabase: { from: f.from },
        },
        { configId: 'SHOW_VERSION_BADGE' }
      ),
}));
vi.mock('@/lib/postgrest-rate-limit', () => ({
  buildPostgrestRateLimitResponse: vi.fn(),
}));

import { PATCH } from '@/app/api/v1/user/onboarding-progress/route';
import {
  GET,
  PUT,
} from '@/legacy-api-routes/v1/users/me/configs/[configId]/route';

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());
for (const [name, handler, body] of [
  ['onboarding', PATCH, { guidance_mode: 'employee_test' }],
  ['staff config read', GET, {}],
  ['staff config write', PUT, { value: 'true' }],
] as const)
  describe(name, () => {
    it.each([
      ['foreign', 'approved'],
      ['approved', undefined],
    ] as const)('denies %s without data', async (tid, configured) => {
      vi.stubEnv('TUTURUUU_AZURE_TENANT_ID', configured);
      f.getUserById.mockResolvedValue({
        data: {
          user: {
            id: 'actor',
            email: 'staff@tuturuuu.com',
            email_confirmed_at: '2026-01-01',
            identities: [{ provider: 'azure', identity_data: { tid } }],
          },
        },
        error: null,
      });
      const response = await handler(
        new NextRequest('https://app.test', {
          method: 'POST',
          body: JSON.stringify(body),
        })
      );
      expect(response.status).toBe(403);
      expect(f.from).not.toHaveBeenCalled();
      expect(await response.json()).not.toHaveProperty('value');
    });
    it('denies a verified xwf account without data', async () => {
      f.getUserById.mockResolvedValue({
        data: {
          user: {
            id: 'actor',
            email: 'staff@xwf.tuturuuu.com',
            email_confirmed_at: '2026-01-01',
            identities: [{ provider: 'email', identity_data: {} }],
          },
        },
        error: null,
      });
      const response = await handler(
        new NextRequest('https://app.test', {
          method: 'POST',
          body: JSON.stringify(body),
        })
      );
      expect(response.status).toBe(403);
      expect(f.from).not.toHaveBeenCalled();
    });
  });
