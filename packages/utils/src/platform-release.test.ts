import { describe, expect, it } from 'vitest';
import {
  getPlatformReleaseInfo,
  normalizePlatformBuildMetadata,
  TUTURUUU_PLATFORM_VERSION,
} from './platform-release';

describe('platform release metadata', () => {
  it('uses the centralized shared browser app version', () => {
    expect(TUTURUUU_PLATFORM_VERSION).toBe('0.1.65');
  });

  it('normalizes generated metadata and derives a short hash', () => {
    expect(
      normalizePlatformBuildMetadata({
        builtAt: '2026-05-27T10:00:00.000Z',
        commitHash: 'abcdef1234567890',
        commitMessage: 'feat: ship version badge',
        deploymentStamp: 'deploy-2026-05-27',
        deploymentUrl: 'https://apps.tuturuuu.com',
        environment: 'production',
        refName: 'production',
      })
    ).toEqual({
      builtAt: '2026-05-27T10:00:00.000Z',
      commitHash: 'abcdef1234567890',
      commitMessage: 'feat: ship version badge',
      deploymentStamp: 'deploy-2026-05-27',
      deploymentUrl: 'https://apps.tuturuuu.com',
      environment: 'production',
      refName: 'production',
      shortCommitHash: 'abcdef1',
    });
  });

  it('keeps local metadata stable when build values are missing', () => {
    expect(normalizePlatformBuildMetadata({})).toMatchObject({
      builtAt: 'local',
      commitHash: 'local',
      commitMessage: 'Unknown',
      deploymentStamp: null,
      deploymentUrl: null,
      environment: 'local',
      refName: 'local',
      shortCommitHash: 'local',
    });
  });

  it('prefers explicit runtime platform build metadata over generated fallback values', () => {
    expect(
      getPlatformReleaseInfo('Tuturuuu', {
        PLATFORM_BUILD_BUILT_AT: '2026-05-28T06:00:00.000Z',
        PLATFORM_BUILD_COMMIT_HASH: '1234567890abcdef',
        PLATFORM_BUILD_COMMIT_MESSAGE: 'fix(web): infer blue green metadata',
        PLATFORM_BUILD_COMMIT_SHORT_HASH: '1234567',
        PLATFORM_BUILD_DEPLOYMENT_STAMP: '2026-05-28T06-00-00Z',
        PLATFORM_BUILD_DEPLOYMENT_URL: 'tuturuuu.com',
        PLATFORM_BUILD_ENVIRONMENT: 'production',
        PLATFORM_BUILD_REF_NAME: 'production',
      })
    ).toMatchObject({
      appName: 'Tuturuuu',
      builtAt: '2026-05-28T06:00:00.000Z',
      commitHash: '1234567890abcdef',
      commitMessage: 'fix(web): infer blue green metadata',
      deploymentStamp: '2026-05-28T06-00-00Z',
      deploymentUrl: 'https://tuturuuu.com',
      environment: 'production',
      refName: 'production',
      shortCommitHash: '1234567',
      version: TUTURUUU_PLATFORM_VERSION,
    });
  });
});
