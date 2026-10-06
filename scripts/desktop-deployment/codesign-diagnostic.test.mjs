import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codesignDiagnostic } from './codesign-diagnostic.mjs';

const fixtures = [
  ['keychain-access', 'errSecInternalComponent'],
  ['identity-unavailable', 'no identity found'],
  ['certificate-trust', 'CSSMERR_TP_NOT_TRUSTED'],
  ['unsigned-component', 'code object is not signed at all'],
  ['bundle-format', 'bundle format unrecognized'],
  [
    'resource-metadata',
    'resource fork, Finder information, or similar detritus not allowed',
  ],
  ['timestamp-unavailable', 'timestamp service is not available'],
];
for (const [category, stderr] of fixtures) {
  test(`allowlisted ${category} classification emits no captured values`, () => {
    for (const captured of [stderr, Buffer.from(stderr)]) {
      assert.equal(
        codesignDiagnostic({ stderr: captured, status: 1 }, 'mach-o'),
        `codesign category=${category} artifact=mach-o exit=1`
      );
    }
  });
}
test('unknown failures never classify message, stdout, signal, or private artifact paths', () => {
  assert.equal(
    codesignDiagnostic(
      {
        message: 'errSecInternalComponent',
        stdout: 'no identity found',
        stderr: 'private arbitrary failure',
        signal: 'private-signal',
        status: null,
      },
      '/private/artifact.app'
    ),
    'codesign category=unknown artifact=unknown exit=unknown'
  );
  assert.equal(
    codesignDiagnostic(undefined, undefined),
    'codesign category=unknown artifact=unknown exit=unknown'
  );
});
test('status and artifact kinds have finite safe admission', () => {
  for (const status of [-1, 256, 1.5, '7', NaN, Infinity, undefined]) {
    assert.equal(
      codesignDiagnostic({ status }, 'framework'),
      'codesign category=unknown artifact=framework exit=unknown'
    );
  }
  for (const artifact of [
    'application',
    'nested-application',
    'framework',
    'xpc-service',
    'mach-o',
    'disk-image',
  ]) {
    assert.equal(
      codesignDiagnostic({ status: 255 }, artifact),
      `codesign category=unknown artifact=${artifact} exit=255`
    );
  }
});
test('captured diagnostic scanning is bounded', () => {
  const stderr = `${'x'.repeat(65536)}errSecInternalComponent`;
  for (const captured of [stderr, Buffer.from(stderr)]) {
    assert.equal(
      codesignDiagnostic({ stderr: captured, status: 1 }, 'application'),
      'codesign category=unknown artifact=application exit=1'
    );
  }
});
