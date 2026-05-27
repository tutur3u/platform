import { describe, expect, it } from 'vitest';
import {
  normalizePlatformBuildMetadata,
  TUTURUUU_PLATFORM_VERSION,
} from './platform-release';

describe('platform release metadata', () => {
  it('uses the centralized shared browser app version', () => {
    expect(TUTURUUU_PLATFORM_VERSION).toBe('0.1.0');
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
});
