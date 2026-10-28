import { afterEach, describe, expect, it, vi } from 'vitest';
import { isVerifiedTuturuuuStaffSession } from '../staff-session';

const staff = {
  email: 'staff@tuturuuu.com',
  email_confirmed_at: '2026-01-01',
  identities: [{ provider: 'email', identity_data: {} }],
};
const azure = (identity_data: Record<string, unknown>) => ({
  provider: 'azure',
  identity_data,
});
afterEach(() => vi.unstubAllEnvs());
describe('verified staff session', () => {
  it.each([
    ['confirmed staff', staff, undefined, true],
    [
      'confirmed xwf staff under the exact default',
      { ...staff, email: 'staff@xwf.tuturuuu.com' },
      undefined,
      false,
    ],
    ['no linked identities', { ...staff, identities: [] }, undefined, false],
    [
      'unconfirmed',
      { ...staff, email_confirmed_at: undefined },
      'approved',
      false,
    ],
    [
      'lookalike',
      { ...staff, email: 'staff@tuturuuu.com.evil.test' },
      'approved',
      false,
    ],
    [
      'other subdomain',
      { ...staff, email: 'staff@other.tuturuuu.com' },
      'approved',
      false,
    ],
    [
      'foreign identity',
      { ...staff, identities: [azure({ tid: 'foreign' })] },
      'approved',
      false,
    ],
    [
      'missing configuration',
      { ...staff, identities: [azure({ tid: 'approved' })] },
      undefined,
      false,
    ],
    [
      'blank configuration',
      { ...staff, identities: [azure({ tid: 'approved' })] },
      '',
      false,
    ],
    [
      'approved identity',
      { ...staff, identities: [azure({ tid: 'approved' })] },
      'approved',
      true,
    ],
    [
      'v2 issuer',
      {
        ...staff,
        identities: [
          azure({ iss: 'https://login.microsoftonline.com/approved/v2.0' }),
        ],
      },
      'approved',
      true,
    ],
    [
      'v1 issuer',
      {
        ...staff,
        identities: [azure({ iss: 'https://sts.windows.net/approved/' })],
      },
      'approved',
      true,
    ],
    [
      'foreign issuer',
      {
        ...staff,
        identities: [azure({ iss: 'https://sts.windows.net/foreign/' })],
      },
      'approved',
      false,
    ],
    [
      'untrusted issuer host',
      {
        ...staff,
        identities: [azure({ iss: 'https://example.test/approved/v2.0' })],
      },
      'approved',
      false,
    ],
    [
      'conflicting issuer',
      {
        ...staff,
        identities: [
          azure({ tid: 'approved', iss: 'https://sts.windows.net/foreign/' }),
        ],
      },
      'approved',
      false,
    ],
    [
      'missing identity claims',
      { ...staff, identities: [azure({})] },
      'approved',
      false,
    ],
    [
      'one foreign linked identity',
      {
        ...staff,
        identities: [azure({ tid: 'approved' }), azure({ tid: 'foreign' })],
      },
      'approved',
      false,
    ],
    [
      'non-Azure identity',
      { ...staff, identities: [{ provider: 'google', identity_data: {} }] },
      undefined,
      true,
    ],
    [
      'incomplete session projection',
      { ...staff, identities: undefined },
      'approved',
      false,
    ],
    ['no user', null, 'approved', false],
  ] as const)('%s', (_name, user, configured, expected) => {
    vi.stubEnv('TUTURUUU_AZURE_TENANT_ID', configured);
    expect(isVerifiedTuturuuuStaffSession(user)).toBe(expected);
  });
});

describe('staff session domain policy', () => {
  const xwf = { ...staff, email: 'staff@xwf.tuturuuu.com' };
  it.each([
    ['exact staff', staff, {}, true],
    ['exact staff with xwf allowed', staff, { allowXwf: true }, true],
    ['xwf staff by default', xwf, undefined, false],
    ['xwf staff when not allowed', xwf, { allowXwf: false }, false],
    ['xwf staff when allowed', xwf, { allowXwf: true }, true],
    [
      'unconfirmed xwf staff when allowed',
      { ...xwf, email_confirmed_at: undefined },
      { allowXwf: true },
      false,
    ],
    [
      'other subdomain when allowed',
      { ...staff, email: 'staff@other.tuturuuu.com' },
      { allowXwf: true },
      false,
    ],
    [
      'uppercase exact domain',
      { ...staff, email: 'staff@TUTURUUU.COM' },
      undefined,
      false,
    ],
    [
      'xwf without linked identities when allowed',
      { ...xwf, identities: [] },
      { allowXwf: true },
      false,
    ],
  ] as const)('%s', (_name, user, policy, expected) => {
    expect(isVerifiedTuturuuuStaffSession(user, policy)).toBe(expected);
  });

  it('pins the Azure tenant for xwf staff too', () => {
    vi.stubEnv('TUTURUUU_AZURE_TENANT_ID', 'approved');
    const linked = (tid: string) => ({
      ...xwf,
      identities: [azure({ tid })],
    });
    expect(
      isVerifiedTuturuuuStaffSession(linked('approved'), { allowXwf: true })
    ).toBe(true);
    expect(
      isVerifiedTuturuuuStaffSession(linked('foreign'), { allowXwf: true })
    ).toBe(false);
  });
});
