import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  catalogStatus: 'early_access' as string | null,
  getVerifiedAuthUser: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/user', () => ({
  getVerifiedAuthUser: mocks.getVerifiedAuthUser,
}));
vi.mock('@tuturuuu/utils/integrations-catalog', () => ({
  getCatalogIntegrationStatus: (id: string) =>
    id === 'upskii' ? mocks.catalogStatus : null,
}));

const { canUserLinkUpskii, readBasicAppCredentials } = await import('./access');

const admin = {} as never;
const staff = {
  email: 'ada@tuturuuu.com',
  email_confirmed_at: '2026-11-01T00:00:00.000Z',
  identities: [{ identity_data: {}, provider: 'google' }],
};

describe('Upskii link gate', () => {
  beforeEach(() => {
    mocks.catalogStatus = 'early_access';
    mocks.getVerifiedAuthUser.mockResolvedValue(staff);
    vi.stubEnv('TUTURUUU_AZURE_TENANT_ID', 'tenant-a');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('admits verified staff during early access', async () => {
    expect(await canUserLinkUpskii(admin, 'user-1')).toBe(true);
  });

  it.each([
    ['an unconfirmed email', { ...staff, email_confirmed_at: null }],
    ['a lookalike domain', { ...staff, email: 'ada@tuturuuu.com.evil' }],
    [
      'a QA account',
      { ...staff, app_metadata: { qa_staff: true, qa_test: true } },
    ],
    [
      'another Azure tenant',
      {
        ...staff,
        identities: [{ identity_data: { tid: 'tenant-b' }, provider: 'azure' }],
      },
    ],
  ])('refuses %s', async (_label, user) => {
    mocks.getVerifiedAuthUser.mockResolvedValue(user);
    expect(await canUserLinkUpskii(admin, 'user-1')).toBe(false);
  });

  it('fails closed when the catalog entry is missing', async () => {
    mocks.catalogStatus = null;
    mocks.getVerifiedAuthUser.mockResolvedValue({
      ...staff,
      email: 'ada@example.com',
    });
    expect(await canUserLinkUpskii(admin, 'user-1')).toBe(false);
  });

  it('fails closed when the account lookup fails', async () => {
    mocks.getVerifiedAuthUser.mockRejectedValue(new Error('down'));
    expect(await canUserLinkUpskii(admin, 'user-1')).toBe(false);
  });

  it('opens to everyone only on an explicit available status', async () => {
    mocks.catalogStatus = 'available';
    mocks.getVerifiedAuthUser.mockResolvedValue(null);
    expect(await canUserLinkUpskii(admin, 'user-1')).toBe(true);
    mocks.catalogStatus = 'coming_soon';
    expect(await canUserLinkUpskii(admin, 'user-1')).toBe(false);
  });
});

describe('Basic app credentials', () => {
  const headers = (value: string) => ({
    headers: new Headers({ authorization: value }),
  });

  it('reads the app id and secret', () => {
    expect(
      readBasicAppCredentials(headers(`Basic ${btoa('Upskii:s3cr:et')}`))
    ).toEqual({ appId: 'upskii', appSecret: 's3cr:et' });
  });

  it.each([
    ['no header', ''],
    ['a bearer', 'Bearer abc'],
    ['no separator', `Basic ${btoa('upskii')}`],
    ['an empty secret', `Basic ${btoa('upskii:')}`],
    ['a bad app id', `Basic ${btoa('up skii:secret')}`],
  ])('refuses %s', (_label, value) => {
    expect(readBasicAppCredentials(headers(value))).toBeNull();
  });
});
