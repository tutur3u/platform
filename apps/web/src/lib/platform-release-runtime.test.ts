import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWebPlatformReleaseInfo } from './platform-release-runtime';

vi.mock('server-only', () => ({}));

const tempDirs: string[] = [];

function createRuntimeDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-release-'));
  const runtimeDir = path.join(root, 'tmp', 'docker-web');

  tempDirs.push(root);
  fs.mkdirSync(path.join(runtimeDir, 'prod'), { recursive: true });
  fs.mkdirSync(path.join(runtimeDir, 'watch'), { recursive: true });

  return { root, runtimeDir };
}

function writeRuntimeFile(
  runtimeDir: string,
  relativePath: string,
  value: unknown
) {
  const filePath = path.join(runtimeDir, relativePath);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    'utf8'
  );
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

describe('getWebPlatformReleaseInfo', () => {
  it('keeps explicit PLATFORM_BUILD metadata ahead of runtime files', () => {
    const { runtimeDir } = createRuntimeDir();

    writeRuntimeFile(runtimeDir, 'prod/active-color', 'green\n');
    writeRuntimeFile(runtimeDir, 'prod/deployment-stamp', 'runtime-stamp\n');
    writeRuntimeFile(runtimeDir, 'prod/target-state.json', {
      targets: {
        web: {
          activeColor: 'green',
          commitHash: 'runtime-commit',
          commitShortHash: 'runtime',
          deploymentStamp: 'runtime-target-stamp',
          lastPromotedAt: 1780000000000,
        },
      },
    });
    writeRuntimeFile(runtimeDir, 'watch/blue-green-auto-deploy.history.json', [
      {
        activeColor: 'green',
        commitHash: 'runtime-commit',
        commitShortHash: 'runtime',
        commitSubject: 'Runtime deployment',
        deploymentStamp: 'runtime-history-stamp',
        finishedAt: 1780000000000,
        status: 'successful',
      },
    ]);

    expect(
      getWebPlatformReleaseInfo('Tuturuuu', {
        env: {
          PLATFORM_BLUE_GREEN_MONITORING_DIR: runtimeDir,
          PLATFORM_BUILD_BUILT_AT: '2026-05-28T07:00:00.000Z',
          PLATFORM_BUILD_COMMIT_HASH: 'explicit-commit',
          PLATFORM_BUILD_COMMIT_MESSAGE: 'Explicit deployment',
          PLATFORM_BUILD_COMMIT_SHORT_HASH: 'explici',
          PLATFORM_BUILD_DEPLOYMENT_STAMP: 'explicit-stamp',
          PLATFORM_BUILD_DEPLOYMENT_URL: 'https://explicit.tuturuuu.com',
          PLATFORM_BUILD_ENVIRONMENT: 'staging',
          PLATFORM_BUILD_REF_NAME: 'release/manual',
        },
      })
    ).toMatchObject({
      builtAt: '2026-05-28T07:00:00.000Z',
      commitHash: 'explicit-commit',
      commitMessage: 'Explicit deployment',
      deploymentStamp: 'explicit-stamp',
      deploymentUrl: 'https://explicit.tuturuuu.com',
      environment: 'staging',
      refName: 'release/manual',
      shortCommitHash: 'explici',
    });
  });

  it('fills blank local metadata from the active blue-green runtime snapshot', () => {
    const { runtimeDir } = createRuntimeDir();

    writeRuntimeFile(runtimeDir, 'prod/active-color', 'green\n');
    writeRuntimeFile(runtimeDir, 'prod/deployment-stamp', 'runtime-stamp\n');
    writeRuntimeFile(runtimeDir, 'prod/target-state.json', {
      targets: {
        web: {
          activeColor: 'green',
          commitHash: 'green-commit-hash',
          commitShortHash: 'green12',
          deploymentStamp: 'target-stamp',
          lastPromotedAt: 1780000100000,
        },
      },
    });
    writeRuntimeFile(runtimeDir, 'watch/blue-green-auto-deploy.status.json', {
      deployments: [
        {
          activeColor: 'green',
          commitHash: 'green-commit-hash',
          commitShortHash: 'green12',
          commitSubject: 'fix(web): ship runtime badge metadata',
          finishedAt: 1780000100000,
          runtimeState: 'active',
          status: 'successful',
        },
      ],
    });

    expect(
      getWebPlatformReleaseInfo('Tuturuuu', {
        env: {
          PLATFORM_BLUE_GREEN_MONITORING_DIR: runtimeDir,
          PLATFORM_BUILD_BUILT_AT: '',
          PLATFORM_BUILD_COMMIT_HASH: '',
          PLATFORM_BUILD_COMMIT_MESSAGE: '',
          PLATFORM_BUILD_COMMIT_SHORT_HASH: '',
          PLATFORM_BUILD_DEPLOYMENT_STAMP: '',
        },
      })
    ).toMatchObject({
      builtAt: '2026-05-28T20:28:20.000Z',
      commitHash: 'green-commit-hash',
      commitMessage: 'fix(web): ship runtime badge metadata',
      deploymentStamp: 'runtime-stamp',
      shortCommitHash: 'green12',
    });
  });

  it('falls back to the latest successful active-color row when target details are incomplete', () => {
    const { runtimeDir } = createRuntimeDir();

    writeRuntimeFile(runtimeDir, 'prod/active-color', 'blue\n');
    writeRuntimeFile(runtimeDir, 'watch/blue-green-auto-deploy.history.json', [
      {
        activeColor: 'green',
        commitHash: 'newer-green-hash',
        commitShortHash: 'green99',
        commitSubject: 'newer standby refresh',
        finishedAt: 1780000500000,
        status: 'successful',
      },
      {
        activeColor: 'blue',
        commitHash: 'active-blue-hash',
        commitShortHash: 'blue12',
        commitSubject: 'active blue deployment',
        finishedAt: 1780000400000,
        status: 'successful',
      },
    ]);

    expect(
      getWebPlatformReleaseInfo('Tuturuuu', {
        env: {
          PLATFORM_BLUE_GREEN_MONITORING_DIR: runtimeDir,
        },
      })
    ).toMatchObject({
      builtAt: '2026-05-28T20:33:20.000Z',
      commitHash: 'active-blue-hash',
      commitMessage: 'active blue deployment',
      shortCommitHash: 'blue12',
    });
  });

  it('preserves generated local fallback metadata when runtime files are missing', () => {
    const { root } = createRuntimeDir();

    expect(
      getWebPlatformReleaseInfo('Tuturuuu', {
        cwd: path.join(root, 'empty'),
        env: {},
      })
    ).toMatchObject({
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

  it('does not invent deployment URL, ref, or environment from runtime color data', () => {
    const { runtimeDir } = createRuntimeDir();

    writeRuntimeFile(runtimeDir, 'prod/active-color', 'green\n');
    writeRuntimeFile(runtimeDir, 'watch/blue-green-auto-deploy.history.json', [
      {
        activeColor: 'green',
        commitHash: 'green-commit-hash',
        commitShortHash: 'green12',
        commitSubject: 'metadata without deploy context',
        finishedAt: 1780000100000,
        status: 'successful',
      },
    ]);

    expect(
      getWebPlatformReleaseInfo('Tuturuuu', {
        env: {
          PLATFORM_BLUE_GREEN_MONITORING_DIR: runtimeDir,
        },
      })
    ).toMatchObject({
      commitHash: 'green-commit-hash',
      deploymentUrl: null,
      environment: 'local',
      refName: 'local',
    });
  });
});
