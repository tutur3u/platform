import { describe, expect, it } from 'vitest';
import {
  assertDesktopPlatform,
  assertDesktopSigningResources,
  DESKTOP_SIGNING_PROFILES,
  DesktopDeploymentContractError,
  desktopVaultEnabled,
} from './contract';

const windows = { WINDOWS_SIGNING_CERTIFICATE_PASSWORD: 'fixture-password' };
const macos = {
  MACOS_CERTIFICATE_PASSWORD: 'fixture-password',
  MACOS_SIGNING_IDENTITY:
    'Developer ID Application: Fixture Company (ABCDEFGHIJ)',
  APPLE_TEAM_ID: 'ABCDEFGHIJ',
  APP_STORE_CONNECT_API_KEY_ID: 'KLMNOPQRST',
  APP_STORE_CONNECT_ISSUER_ID: '11111111-2222-3333-4444-555555555555',
};

describe('desktop signing profile isolation', () => {
  it.each([undefined, '', 'false', 'TRUE', '1'])(
    'defaults off for %s',
    (value) => {
      expect(desktopVaultEnabled(value)).toBe(false);
    }
  );
  it('requires explicit enablement', () =>
    expect(desktopVaultEnabled('true')).toBe(true));
  it.each(['android', 'ios', 'linux', 'store', null, {}, 'Windows'])(
    'rejects platform %s',
    (value) => {
      expect(() => assertDesktopPlatform(value)).toThrow(
        DesktopDeploymentContractError
      );
    }
  );
  it('accepts only complete Windows signing resources', () => {
    expect(() =>
      assertDesktopSigningResources(
        'windows',
        DESKTOP_SIGNING_PROFILES.windows.files,
        windows
      )
    ).not.toThrow();
  });
  it('accepts only complete macOS Developer ID resources', () => {
    expect(() =>
      assertDesktopSigningResources(
        'macos',
        DESKTOP_SIGNING_PROFILES.macos.files,
        macos
      )
    ).not.toThrow();
  });
  it.each(
    [
      [],
      ['apple_distribution_certificate_p12'],
      ['macos_developer_id_certificate_p12'],
      [
        'windows_authenticode_certificate_pfx',
        'windows_authenticode_certificate_pfx',
      ],
      [
        'windows_authenticode_certificate_pfx',
        'macos_notarization_private_key_p8',
      ],
    ].map((files) => ({ files }))
  )('rejects missing, duplicate or other-profile files $files', ({ files }) => {
    expect(() =>
      assertDesktopSigningResources('windows', files, windows)
    ).toThrow(DesktopDeploymentContractError);
  });
  it('rejects extra mobile, public build, or other-OS scalar resources', () => {
    for (const name of [
      'APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD',
      'API_BASE_URL',
      'MACOS_CERTIFICATE_PASSWORD',
    ]) {
      expect(() =>
        assertDesktopSigningResources(
          'windows',
          DESKTOP_SIGNING_PROFILES.windows.files,
          { ...windows, [name]: 'fixture' }
        )
      ).toThrow(DesktopDeploymentContractError);
    }
  });
  it.each(['', '\nfixture', 'fixture\u0000', '😀'.repeat(9000), 1, undefined])(
    'rejects invalid signing values without reflecting them',
    (value) => {
      try {
        assertDesktopSigningResources(
          'windows',
          DESKTOP_SIGNING_PROFILES.windows.files,
          { WINDOWS_SIGNING_CERTIFICATE_PASSWORD: value }
        );
        throw new Error('accepted');
      } catch (error) {
        expect(error).toBeInstanceOf(DesktopDeploymentContractError);
        expect((error as Error).message).toBe(
          'Desktop deployment contract rejected'
        );
      }
    }
  );
  it.each([
    ['MACOS_SIGNING_IDENTITY', 'Apple Distribution: Fixture'],
    ['APPLE_TEAM_ID', 'invalid'],
    ['APP_STORE_CONNECT_API_KEY_ID', 'invalid'],
    ['APP_STORE_CONNECT_ISSUER_ID', 'invalid'],
  ])('rejects invalid macOS %s', (name, value) => {
    expect(() =>
      assertDesktopSigningResources(
        'macos',
        DESKTOP_SIGNING_PROFILES.macos.files,
        { ...macos, [name]: value }
      )
    ).toThrow(DesktopDeploymentContractError);
  });
});
