import { createAppleIntegrityVerifier } from '@tuturuuu/internal-api/native-integrity';

const versions = (name: string) =>
  (process.env[name] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
function profile(platform: 'ios' | 'macos') {
  return createAppleIntegrityVerifier({
    platform,
    teamId: process.env.NATIVE_INTEGRITY_APPLE_TEAM_ID ?? '',
    allowDevelopment:
      process.env.NATIVE_INTEGRITY_APPLE_ENVIRONMENT === 'development',
    bundleId:
      (platform === 'ios'
        ? process.env.NATIVE_INTEGRITY_APPLE_BUNDLE_ID
        : process.env.NATIVE_INTEGRITY_APPLE_MACOS_BUNDLE_ID) ?? '',
    signingIdentifier:
      platform === 'macos'
        ? process.env.NATIVE_INTEGRITY_APPLE_MACOS_SIGNING_IDENTIFIER
        : undefined,
    allowedIosAclBlobs:
      platform === 'ios'
        ? versions('NATIVE_INTEGRITY_APPLE_IOS_ACL_BLOBS')
        : undefined,
    allowedBundleVersions: versions(
      platform === 'ios'
        ? 'NATIVE_INTEGRITY_APPLE_ALLOWED_BUNDLE_VERSIONS'
        : 'NATIVE_INTEGRITY_APPLE_MACOS_ALLOWED_BUNDLE_VERSIONS'
    ),
  });
}
export function configuredAppleVerifiers() {
  return {
    async attest(
      input: Parameters<
        ReturnType<typeof createAppleIntegrityVerifier>['attest']
      >[0]
    ) {
      try {
        return await profile('ios').attest(input);
      } catch {
        /* Only configured Apple identities can succeed. */
      }
      if (process.env.NATIVE_INTEGRITY_APPLE_MACOS_BUNDLE_ID)
        return profile('macos').attest(input);
      throw new Error('Apple app identity verification failed');
    },
    async assert(
      input: Parameters<
        ReturnType<typeof createAppleIntegrityVerifier>['assert']
      >[0] & { platform: 'ios' | 'macos' }
    ) {
      return profile(input.platform).assert(input);
    },
  };
}
