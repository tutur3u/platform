import { describe, expect, it } from 'vitest';
import { createSyncManifest, validateSyncPath } from './sync-manifest';

describe('devbox sync manifest', () => {
  it.each([
    'src/index.ts',
    'packages/sdk/src/cli/index.ts',
    'README.md',
  ])('accepts workspace-relative path %s', (path) => {
    expect(validateSyncPath(path)).toBe(path);
  });

  it.each([
    '/etc/passwd',
    '../secret',
    'src/../../secret',
    '.git/config',
    'node_modules/pkg/index.js',
    '.env',
    'apps/web/.env.local',
  ])('rejects unsafe or implicitly secret path %s', (path) => {
    expect(() => validateSyncPath(path)).toThrow();
  });

  it('allows explicit env files when requested', () => {
    expect(validateSyncPath('.env.remote', { allowEnvFiles: true })).toBe(
      '.env.remote'
    );
  });

  it('creates a sorted manifest with stable total size', () => {
    expect(
      createSyncManifest([
        { path: 'b.ts', sha256: 'b', sizeBytes: 2, status: 'modified' },
        { path: 'a.ts', sha256: 'a', sizeBytes: 1, status: 'added' },
        { path: 'c.ts', status: 'deleted' },
      ])
    ).toEqual({
      entries: [
        { path: 'a.ts', sha256: 'a', sizeBytes: 1, status: 'added' },
        { path: 'b.ts', sha256: 'b', sizeBytes: 2, status: 'modified' },
        { path: 'c.ts', status: 'deleted' },
      ],
      totalBytes: 3,
    });
  });
});
