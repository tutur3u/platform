import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getPlatformReleaseInfo,
  readInlinedEnv,
  normalizePlatformBuildMetadata,
  TUTURUUU_PLATFORM_VERSION,
} from './platform-release';

describe('platform release metadata', () => {
  it('uses the centralized shared browser app version', () => {
    expect(TUTURUUU_PLATFORM_VERSION).toBe('0.73.0'); // x-release-please-version
  });

  it('preserves the source timestamp in builtAt and derives a short hash', () => {
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
  describe('local build stamp precedence', () => {
    const local = {
      PLATFORM_LOCAL_BUILD_BUILT_AT: '2026-11-21T02:00:00.000Z',
      PLATFORM_LOCAL_BUILD_COMMIT_HASH: 'abcdef0123456789',
      PLATFORM_LOCAL_BUILD_COMMIT_MESSAGE: 'feat: local work',
      PLATFORM_LOCAL_BUILD_COMMIT_SHORT_HASH: 'abcdef0',
      PLATFORM_LOCAL_BUILD_REF_NAME: 'feature/local',
    };
    const placeholders = {
      builtAt: 'local',
      commitHash: 'local',
      commitMessage: 'Unknown',
      environment: 'local',
      refName: 'local',
    };

    it('fills generated placeholders from the local stamp', () => {
      expect(
        getPlatformReleaseInfo('Mail', {}, local, placeholders)
      ).toMatchObject({
        builtAt: '2026-11-21T02:00:00.000Z',
        commitHash: 'abcdef0123456789',
        commitMessage: 'feat: local work',
        environment: 'local',
        refName: 'feature/local',
        shortCommitHash: 'abcdef0',
      });
    });

    it('keeps generated CI metadata over a local stamp', () => {
      const generated = {
        builtAt: '2026-06-01T12:34:56.000Z',
        commitHash: '1234567890abcdef',
        commitMessage: 'feat: ci build',
        environment: 'production',
        refName: 'production',
      };
      expect(
        getPlatformReleaseInfo('Mail', {}, local, generated)
      ).toMatchObject({
        ...generated,
        shortCommitHash: '1234567',
      });
    });

    it('keeps runtime variables over a local stamp', () => {
      const info = getPlatformReleaseInfo(
        'Mail',
        {
          PLATFORM_BUILD_BUILT_AT: '2026-11-20T00:00:00.000Z',
          PLATFORM_BUILD_COMMIT_HASH: 'fedcba9876543210',
        },
        local,
        placeholders
      );
      expect(info).toMatchObject({
        builtAt: '2026-11-20T00:00:00.000Z',
        commitHash: 'fedcba9876543210',
        refName: 'feature/local',
        shortCommitHash: 'fedcba9',
      });
    });
  });
  describe('browser bundles', () => {
    it('reads an unreplaced env reference as unset instead of throwing', () => {
      expect(
        readInlinedEnv(() => {
          throw new ReferenceError('process is not defined');
        })
      ).toBeUndefined();
      expect(readInlinedEnv(() => '2026-11-21T02:00:00.000Z')).toBe(
        '2026-11-21T02:00:00.000Z'
      );
    });

    it('reads inlined local stamps without a process guard', () => {
      // Vite replaces each process.env reference with a literal; a
      // `typeof process` guard would skip them in the browser.
      const source = readFileSync(
        resolve(__dirname, 'platform-release.ts'),
        'utf8'
      );
      const body = source.slice(
        source.indexOf('function getLocalBuildEnv'),
        source.indexOf('export function readInlinedEnv')
      );
      expect(body).not.toContain('typeof process');
      expect(body).toContain('process.env.PLATFORM_LOCAL_BUILD_BUILT_AT');
    });
  });

  describe('commit fields stay paired', () => {
    const generated = {
      builtAt: '2026-06-01T12:34:56.000Z',
      commitHash: '1234567890abcdef',
      commitMessage: 'feat: ci build',
      environment: 'production',
      refName: 'production',
    };

    it('drops another commit message when only a runtime hash is set', () => {
      expect(
        getPlatformReleaseInfo(
          'Mail',
          { PLATFORM_BUILD_COMMIT_HASH: 'fedcba9876543210' },
          {},
          generated
        )
      ).toMatchObject({
        commitHash: 'fedcba9876543210',
        commitMessage: 'Unknown',
        shortCommitHash: 'fedcba9',
      });
    });

    it('keeps the message when the runtime hash names the same commit', () => {
      expect(
        getPlatformReleaseInfo(
          'Mail',
          { PLATFORM_BUILD_COMMIT_HASH: '1234567890abcdef' },
          {},
          generated
        )
      ).toMatchObject({
        commitMessage: 'feat: ci build',
        shortCommitHash: '1234567',
      });
    });
  });
});
