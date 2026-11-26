import { describe, expect, it } from 'vitest';
import {
  EXPECTED_ANDROID_PACKAGE_NAME,
  EXPECTED_IOS_BUNDLE_ID,
  EXPECTED_IOS_WATCH_BUNDLE_ID,
  EXPECTED_IOS_WATCH_WIDGETS_BUNDLE_ID,
} from './constants';
import {
  assertMobileDeploymentEnvKey,
  assertMobileDeploymentFileKind,
  MobileDeploymentValidationError,
  normalizeEnvEntry,
  parseEnvFile,
  renderEnvFile,
  validateFileArtifact,
  validateScalarValue,
} from './validation';

describe('mobile deployment validation', () => {
  it('rejects legacy embedded file env keys', () => {
    expect(() =>
      parseEnvFile('MOBILE_ANDROID_GOOGLE_SERVICES_JSON_B64=secret\n')
    ).toThrow(MobileDeploymentValidationError);
  });

  it('normalizes single env key values', () => {
    expect(normalizeEnvEntry(' API_BASE_URL ', 'https://tuturuuu.com')).toEqual(
      {
        key: 'API_BASE_URL',
        value: 'https://tuturuuu.com',
      }
    );
  });

  it('rejects invalid single env key names', () => {
    expect(() => assertMobileDeploymentEnvKey('not_allowed')).toThrow(
      MobileDeploymentValidationError
    );
  });

  it('rejects blocked single env key names', () => {
    expect(() =>
      normalizeEnvEntry('MOBILE_IOS_GOOGLE_SERVICE_INFO_PLIST_B64', 'secret')
    ).toThrow(MobileDeploymentValidationError);
  });

  it('rejects env keys that collide with built-in secret names', () => {
    expect(() => normalizeEnvEntry('ANDROID_KEYSTORE_ALIAS', 'upload')).toThrow(
      MobileDeploymentValidationError
    );
  });

  it('renders env files in stable key order', () => {
    expect(
      renderEnvFile({
        TURNSTILE_SITE_KEY: 'site-key',
        API_BASE_URL: 'https://tuturuuu.com',
      })
    ).toBe('API_BASE_URL=https://tuturuuu.com\nTURNSTILE_SITE_KEY=site-key\n');
  });

  it('rejects multi-line scalar values', () => {
    expect(() =>
      validateScalarValue('ANDROID_KEYSTORE_PASSWORD', 'first\nsecond')
    ).toThrow(MobileDeploymentValidationError);
  });

  it('pins production package and bundle identifiers', () => {
    expect(
      validateScalarValue(
        'GOOGLE_PLAY_PACKAGE_NAME',
        EXPECTED_ANDROID_PACKAGE_NAME
      )
    ).toBe(EXPECTED_ANDROID_PACKAGE_NAME);
    expect(validateScalarValue('APPLE_BUNDLE_ID', EXPECTED_IOS_BUNDLE_ID)).toBe(
      EXPECTED_IOS_BUNDLE_ID
    );
    expect(() =>
      validateScalarValue('GOOGLE_PLAY_PACKAGE_NAME', 'com.example.app')
    ).toThrow(MobileDeploymentValidationError);
  });

  it('validates Android Firebase JSON package identity', () => {
    const payload = new TextEncoder().encode(
      JSON.stringify({
        client: [
          {
            client_info: {
              android_client_info: {
                package_name: EXPECTED_ANDROID_PACKAGE_NAME,
              },
            },
          },
        ],
      })
    );

    expect(() =>
      validateFileArtifact('android_google_services_json', payload)
    ).not.toThrow();
  });

  it('validates iOS plist bundle identity', () => {
    const payload = new TextEncoder().encode(
      `<plist><dict><key>BUNDLE_ID</key><string>${EXPECTED_IOS_BUNDLE_ID}</string></dict></plist>`
    );

    expect(() =>
      validateFileArtifact('ios_google_service_info_plist', payload)
    ).not.toThrow();
  });

  it('accepts and validates Apple Watch and Watch Widgets provisioning profiles with exact bundle ID matching', () => {
    expect(
      assertMobileDeploymentFileKind(
        'apple_watch_app_store_provisioning_profile'
      )
    ).toBe('apple_watch_app_store_provisioning_profile');
    expect(
      assertMobileDeploymentFileKind(
        'apple_watch_widgets_app_store_provisioning_profile'
      )
    ).toBe('apple_watch_widgets_app_store_provisioning_profile');

    const encodeProfile = (bundleId: string) =>
      new TextEncoder().encode(
        `<plist><dict><key>Entitlements</key><dict>\n\t<key>application-identifier</key>\n\t<string>TEAM123456.${bundleId}</string>\n</dict></dict></plist>`
      );

    const iosProfile = encodeProfile(EXPECTED_IOS_BUNDLE_ID);
    const watchProfile = encodeProfile(EXPECTED_IOS_WATCH_BUNDLE_ID);
    const widgetsProfile = encodeProfile(EXPECTED_IOS_WATCH_WIDGETS_BUNDLE_ID);

    expect(() =>
      validateFileArtifact('apple_app_store_provisioning_profile', iosProfile)
    ).not.toThrow();
    expect(() =>
      validateFileArtifact(
        'apple_watch_app_store_provisioning_profile',
        watchProfile
      )
    ).not.toThrow();
    expect(() =>
      validateFileArtifact(
        'apple_watch_widgets_app_store_provisioning_profile',
        widgetsProfile
      )
    ).not.toThrow();

    expect(() =>
      validateFileArtifact('apple_app_store_provisioning_profile', watchProfile)
    ).toThrow(MobileDeploymentValidationError);
    expect(() =>
      validateFileArtifact(
        'apple_app_store_provisioning_profile',
        widgetsProfile
      )
    ).toThrow(MobileDeploymentValidationError);
    expect(() =>
      validateFileArtifact(
        'apple_watch_app_store_provisioning_profile',
        widgetsProfile
      )
    ).toThrow(MobileDeploymentValidationError);
    expect(() =>
      validateFileArtifact(
        'apple_watch_app_store_provisioning_profile',
        iosProfile
      )
    ).toThrow(MobileDeploymentValidationError);
    expect(() =>
      validateFileArtifact(
        'apple_watch_widgets_app_store_provisioning_profile',
        watchProfile
      )
    ).toThrow(MobileDeploymentValidationError);
    expect(() =>
      validateFileArtifact(
        'apple_watch_widgets_app_store_provisioning_profile',
        iosProfile
      )
    ).toThrow(MobileDeploymentValidationError);
  });
});
