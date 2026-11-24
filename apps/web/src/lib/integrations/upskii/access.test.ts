import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  catalogStatus: 'early_access' as string | null,
  getVerifiedAuthUser: vi.fn(),
  listUsers: vi.fn(),
}));

vi.mock('@/lib/qa-test-users/store', () => ({
  createQaStore: () => ({ listUsers: mocks.listUsers }),
}));

vi.mock('@tuturuuu/supabase/next/user', () => ({
  getVerifiedAuthUser: mocks.getVerifiedAuthUser,
}));
vi.mock('@tuturuuu/utils/integrations-catalog', () => ({
  getCatalogIntegrationStatus: (id: string) =>
    id === 'upskii' ? mocks.catalogStatus : null,
}));

const { canUserLinkUpskii, getUpskiiLinkAccess, readBasicAppCredentials } =
  await import('./access');

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
    mocks.getVerifiedAuthUser.mockResolvedValue({
      ...staff,
      email: 'person@example.com',
    });
    expect(await canUserLinkUpskii(admin, 'user-1')).toBe(true);
    mocks.catalogStatus = 'coming_soon';
    expect(await canUserLinkUpskii(admin, 'user-1')).toBe(false);
  });

  it('fails closed on a missing account even when linking is open', async () => {
    mocks.catalogStatus = 'available';
    mocks.getVerifiedAuthUser.mockResolvedValue(null);
    expect(await canUserLinkUpskii(admin, 'user-1')).toBe(false);
    mocks.getVerifiedAuthUser.mockRejectedValue(new Error('down'));
    expect(await canUserLinkUpskii(admin, 'user-1')).toBe(false);
  });
});

describe('Upskii link QA exception', () => {
  const QA_ID = '00000000-0000-4000-8000-0000000000aa';
  const future = new Date(Date.now() + 60 * 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  const qa = (marker: Record<string, unknown> = {}, extra = {}) => ({
    id: QA_ID,
    email: 'qa+abcd1234-1@tutur3u.com',
    email_confirmed_at: '2026-11-24T00:00:00.000Z',
    identities: [{ identity_data: {}, provider: 'email' }],
    app_metadata: {
      qa_test: true,
      qa_run: 'abcd1234',
      qa_owner: '11111111-1111-4111-8111-111111111111',
      qa_purpose: 'upskii-e2e',
      qa_expires_at: future,
      qa_staff: false,
      ...marker,
    },
    ...extra,
  });
  const row = (overrides = {}) => ({
    userId: QA_ID,
    state: 'active',
    purpose: 'upskii-e2e',
    expiresAt: future,
    ...overrides,
  });
  const fleet = { upskiiEmail: 'qa-fleet+learner-1@tuturuuu.com' };

  beforeEach(() => {
    mocks.catalogStatus = 'early_access';
    mocks.getVerifiedAuthUser.mockResolvedValue(qa());
    mocks.listUsers.mockResolvedValue([row()]);
  });

  it('admits a live upskii-e2e QA account linking a QA fleet identity', async () => {
    expect(await getUpskiiLinkAccess(admin, QA_ID, fleet)).toEqual({
      allowed: true,
      reason: 'qa',
    });
    expect(mocks.listUsers).toHaveBeenCalledWith('abcd1234', false);
  });

  it('reports canLink for a live upskii-e2e QA account', async () => {
    expect(await canUserLinkUpskii(admin, QA_ID)).toBe(true);
  });

  it('still refuses a non-QA account without staff', async () => {
    mocks.getVerifiedAuthUser.mockResolvedValue({
      ...staff,
      email: 'person@example.com',
    });
    expect(await getUpskiiLinkAccess(admin, 'user-1', fleet)).toEqual({
      allowed: false,
      reason: 'early_access',
    });
  });

  it.each([
    ['an expired run marker', qa({ qa_expires_at: past }), [row()]],
    ['another purpose', qa({ qa_purpose: 'meet-load' }), [row()]],
    [
      'a banned (deleting) account',
      qa({}, { banned_until: '2999-01-01T00:00:00Z' }),
      [row()],
    ],
    ['an unconfirmed account', qa({}, { email_confirmed_at: null }), [row()]],
    ['a deleted ledger row', qa(), []],
    ['a deleting ledger row', qa(), [row({ state: 'deleting' })]],
    ['an expired ledger run', qa(), [row({ expiresAt: past })]],
    ['a ledger purpose mismatch', qa(), [row({ purpose: 'meet-load' })]],
  ])('refuses %s', async (_label, user, rows) => {
    mocks.getVerifiedAuthUser.mockResolvedValue(user);
    mocks.listUsers.mockResolvedValue(rows);
    expect(await getUpskiiLinkAccess(admin, QA_ID, fleet)).toEqual({
      allowed: false,
      reason: 'qa_run',
    });
    expect(await canUserLinkUpskii(admin, QA_ID)).toBe(false);
  });

  it('fails closed when the ledger is unavailable', async () => {
    mocks.listUsers.mockRejectedValue(new Error('down'));
    expect(await canUserLinkUpskii(admin, QA_ID, fleet)).toBe(false);
  });

  it.each([
    ['an ordinary Upskii email', 'learner@upskii.test'],
    ['a staff address', 'ada@tuturuuu.com'],
    ['a lookalike domain', 'qa-fleet+a@tuturuuu.com.evil'],
    ['an empty tag', 'qa-fleet+@tuturuuu.com'],
    ['an over-long tag', `qa-fleet+${'a'.repeat(41)}@tuturuuu.com`],
    ['a missing email', null],
  ])('refuses a QA account linking %s', async (_label, upskiiEmail) => {
    expect(await getUpskiiLinkAccess(admin, QA_ID, { upskiiEmail })).toEqual({
      allowed: false,
      reason: 'qa_identity',
    });
  });

  it('keeps the QA rules when linking is open to everyone', async () => {
    mocks.catalogStatus = 'available';
    expect(
      await canUserLinkUpskii(admin, QA_ID, {
        upskiiEmail: 'learner@upskii.test',
      })
    ).toBe(false);
    mocks.getVerifiedAuthUser.mockResolvedValue(qa({ qa_purpose: 'other' }));
    expect(await canUserLinkUpskii(admin, QA_ID)).toBe(false);
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
