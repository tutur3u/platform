// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const f = vi.hoisted(() => ({
  resolve: vi.fn(),
  getUserById: vi.fn(),
  from: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: f.resolve,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({ from: f.from }),
  createAdminClient: async () => ({
    from: f.from,
    auth: { admin: { getUserById: f.getUserById } },
  }),
}));
vi.mock('next/server', async () => ({
  ...(await vi.importActual<object>('next/server')),
  connection: vi.fn(),
}));

import { GET as crawlList } from '@/legacy-api-routes/[wsId]/crawlers/list/route';
import { POST as forecast } from '@/legacy-api-routes/v1/aurora/forecast/route';
import { POST as health } from '@/legacy-api-routes/v1/aurora/health/route';
import { POST as ml } from '@/legacy-api-routes/v1/aurora/ml-metrics/route';
import { POST as statistical } from '@/legacy-api-routes/v1/aurora/statistical-metrics/route';
import { POST as crawl } from '@/legacy-api-routes/v1/workspaces/[wsId]/crawlers/route';
import { hasAIWhitelistAccess } from './ai-whitelist/authorization';
import { hasManagedCronAdminAccess } from './managed-cron/authorization';
import { canMutateManagedCronEnableSecret } from './workspace-secrets/managed-cron';

const staff = {
  id: 'staff-id',
  email: 'staff@tuturuuu.com',
  email_confirmed_at: '2026-01-01',
  identities: [{ provider: 'email', identity_data: {} }],
};
const cases = [
  [
    'foreign identity',
    {
      ...staff,
      identities: [{ provider: 'azure', identity_data: { tid: 'foreign' } }],
    },
    'approved',
    false,
  ],
  [
    'missing configuration',
    {
      ...staff,
      identities: [{ provider: 'azure', identity_data: { tid: 'approved' } }],
    },
    undefined,
    false,
  ],
  [
    'approved identity',
    {
      ...staff,
      identities: [{ provider: 'azure', identity_data: { tid: 'approved' } }],
    },
    'approved',
    true,
  ],
  ['confirmed non-Azure', staff, undefined, true],
  [
    'confirmed xwf',
    { ...staff, email: 'staff@xwf.tuturuuu.com' },
    undefined,
    false,
  ],
  [
    'unconfirmed',
    { ...staff, email_confirmed_at: undefined },
    'approved',
    false,
  ],
  [
    'lookalike',
    { ...staff, email: 'staff@tuturuuu.com.evil' },
    'approved',
    false,
  ],
] as const;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AURORA_EXTERNAL_URL', 'https://synthetic.invalid');
  vi.stubEnv('AURORA_EXTERNAL_WSID', 'synthetic-id');
  vi.stubGlobal('fetch', f.fetch);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
for (const [name, handler] of [
  ['AI whitelist', () => hasAIWhitelistAccess()],
  ['cron admin', () => hasManagedCronAdminAccess()],
  [
    'cron secret',
    () => canMutateManagedCronEnableSecret(new Request('https://app.test')),
  ],
] as const)
  describe(name, () => {
    it.each(cases)('%s', async (_name, user, configured, allowed) => {
      vi.stubEnv('TUTURUUU_AZURE_TENANT_ID', configured);
      f.resolve.mockResolvedValue({ user, authError: null });
      f.getUserById.mockResolvedValue({ data: { user }, error: null });
      expect(await handler()).toBe(allowed);
    });
  });
for (const [name, handler] of [
  ['Aurora health', () => health()],
  ['Aurora forecast', () => forecast()],
  ['Aurora ML metrics', () => ml()],
  ['Aurora statistics', () => statistical()],
  [
    'crawler write',
    () =>
      crawl(new Request('https://app.test', { method: 'POST', body: '{}' })),
  ],
  ['crawler list', () => crawlList(new Request('https://app.test'))],
] as const)
  describe(name, () => {
    it.each(cases.filter((row) => !row[3]))(
      'denies %s before data/provider access',
      async (_name, user, configured) => {
        vi.stubEnv('TUTURUUU_AZURE_TENANT_ID', configured);
        f.resolve.mockResolvedValue({ user, authError: null });
        f.getUserById.mockResolvedValue({ data: { user }, error: null });
        const response = await handler();
        expect(response.status).toBe(403);
        expect(f.from).not.toHaveBeenCalled();
        expect(f.fetch).not.toHaveBeenCalled();
        expect(await response.json()).not.toHaveProperty('data');
      }
    );
  });
