import { describe, expect, it } from 'vitest';
import {
  isReproduciblePlatformBuild,
  platformBuildDefines,
  resolveLocalPlatformBuildEnv,
} from './platform-build-env';

const HASH = '0123456789abcdef0123456789abcdef01234567';
const now = () => new Date('2026-11-21T02:00:00.000Z');
const git = (args: string[]) =>
  ({
    'rev-parse HEAD': HASH,
    [`log -1 --pretty=%s ${HASH}`]: 'feat(mail): fit the toolbar corners',
    'branch --show-current': 'feature/mail',
  })[args.join(' ')] ?? null;

describe('resolveLocalPlatformBuildEnv', () => {
  it('stamps a local build with its start time and the Git commit', () => {
    expect(resolveLocalPlatformBuildEnv({ env: {}, git, now })).toEqual({
      PLATFORM_LOCAL_BUILD_BUILT_AT: '2026-11-21T02:00:00.000Z',
      PLATFORM_LOCAL_BUILD_COMMIT_HASH: HASH,
      PLATFORM_LOCAL_BUILD_COMMIT_MESSAGE:
        'feat(mail): fit the toolbar corners',
      PLATFORM_LOCAL_BUILD_COMMIT_SHORT_HASH: '0123456',
      PLATFORM_LOCAL_BUILD_REF_NAME: 'feature/mail',
    });
  });

  it('still stamps the build time without Git', () => {
    expect(
      resolveLocalPlatformBuildEnv({ env: {}, git: () => null, now })
    ).toEqual({ PLATFORM_LOCAL_BUILD_BUILT_AT: '2026-11-21T02:00:00.000Z' });
  });

  it('keeps explicit environment values', () => {
    expect(
      resolveLocalPlatformBuildEnv({
        env: {
          PLATFORM_BUILD_BUILT_AT: '2026-01-01T00:00:00.000Z',
          PLATFORM_BUILD_REF_NAME: 'release',
        },
        git,
        now,
      })
    ).toMatchObject({
      PLATFORM_LOCAL_BUILD_BUILT_AT: '2026-01-01T00:00:00.000Z',
      PLATFORM_LOCAL_BUILD_REF_NAME: 'release',
    });
  });

  it('pairs an explicit hash only with explicit commit details', () => {
    expect(
      resolveLocalPlatformBuildEnv({
        env: { PLATFORM_BUILD_COMMIT_HASH: 'fedcba9876543210' },
        git,
        now,
      })
    ).toEqual({
      PLATFORM_LOCAL_BUILD_BUILT_AT: '2026-11-21T02:00:00.000Z',
      PLATFORM_LOCAL_BUILD_COMMIT_HASH: 'fedcba9876543210',
      PLATFORM_LOCAL_BUILD_COMMIT_SHORT_HASH: 'fedcba9',
      PLATFORM_LOCAL_BUILD_REF_NAME: 'feature/mail',
    });
  });

  it.each([
    [{ CI: 'true' }],
    [{ CI: '1' }],
    [{ SOURCE_DATE_EPOCH: '1780317296' }],
  ])('leaves reproducible builds (%o) to the generated metadata', (env) => {
    expect(isReproduciblePlatformBuild(env)).toBe(true);
    expect(resolveLocalPlatformBuildEnv({ env, git, now })).toEqual({});
  });

  it.each([[{}], [{ CI: '' }], [{ CI: 'false' }], [{ CI: '0' }]])(
    'treats %o as a local build',
    (env) => {
      expect(isReproduciblePlatformBuild(env)).toBe(false);
    }
  );

  it('reads the real checkout when no Git reader is injected', () => {
    const values = resolveLocalPlatformBuildEnv({ env: {}, now });
    expect(values.PLATFORM_LOCAL_BUILD_COMMIT_HASH).toMatch(/^[0-9a-f]{40}$/u);
  });
});

describe('platformBuildDefines', () => {
  it('maps values to JSON process.env defines', () => {
    expect(
      platformBuildDefines({
        PLATFORM_LOCAL_BUILD_BUILT_AT: '2026-11-21T02:00:00Z',
      })
    ).toEqual({
      'process.env.PLATFORM_LOCAL_BUILD_BUILT_AT': '"2026-11-21T02:00:00Z"',
    });
  });
});
