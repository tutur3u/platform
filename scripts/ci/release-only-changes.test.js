const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  sameExceptVersion,
  shouldRunChecks,
} = require('./release-only-changes');

test('version-only package manifests leave E2E unchanged', () => {
  assert.equal(
    sameExceptVersion(
      '{"name":"@tuturuuu/ui","version":"0.35.1","dependencies":{"x":"1"}}',
      '{"name":"@tuturuuu/ui","version":"0.36.0","dependencies":{"x":"1"}}'
    ),
    true
  );
  assert.equal(
    shouldRunChecks(
      [
        '.release-please-manifest.json',
        'CHANGELOG.md',
        'apps/mobile/pubspec.yaml',
        'packages/ui/package.json',
        'packages/utils/src/platform-release.ts',
      ],
      (path) => {
        const files = {
          '.release-please-manifest.json': [
            '{".":"0.57.0","apps/mobile":"0.14.0"}',
            '{".":"0.58.0","apps/mobile":"0.15.0"}',
          ],
          'apps/mobile/pubspec.yaml': [
            'name: mobile\nversion: 0.14.0+88\ndependencies:\n  x: 1\n',
            'name: mobile\nversion: 0.15.0+89\ndependencies:\n  x: 1\n',
          ],
          'packages/ui/package.json': [
            '{"name":"@tuturuuu/ui","version":"0.35.1"}',
            '{"name":"@tuturuuu/ui","version":"0.36.0"}',
          ],
          'packages/utils/src/platform-release.ts': [
            "export const TUTURUUU_PLATFORM_VERSION = '0.57.0'; // x-release-please-version\n",
            "export const TUTURUUU_PLATFORM_VERSION = '0.58.0'; // x-release-please-version\n",
          ],
        };
        return files[path];
      }
    ),
    false
  );
});

test('dependency and source changes still run E2E', () => {
  assert.equal(
    sameExceptVersion(
      '{"name":"web","version":"1.0.0","dependencies":{"x":"1"}}',
      '{"name":"web","version":"1.0.1","dependencies":{"x":"2"}}'
    ),
    false
  );
  assert.equal(
    shouldRunChecks(['apps/web/package.json'], () => [
      '{"name":"web","version":"1.0.0","dependencies":{"x":"1"}}',
      '{"name":"web","version":"1.0.1","dependencies":{"x":"2"}}',
    ]),
    true
  );
  assert.equal(
    shouldRunChecks(['apps/web/src/app/page.tsx'], () => {
      throw new Error('not a release file');
    }),
    true
  );
  assert.equal(
    shouldRunChecks(['apps/mobile/pubspec.yaml'], () => [
      'version: 0.14.0+88\ndependencies:\n  x: 1\n',
      'version: 0.15.0+89\ndependencies:\n  x: 2\n',
    ]),
    true
  );
});

test('missing manifests and unknown comparisons fail open to E2E', () => {
  assert.equal(
    shouldRunChecks([], () => []),
    true
  );
  assert.equal(
    shouldRunChecks(['packages/ui/package.json'], () => {
      throw new Error('file missing');
    }),
    true
  );
});
