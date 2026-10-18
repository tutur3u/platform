const assert = require('node:assert/strict');
const test = require('node:test');
const {
  installFailureDiagnostic,
} = require('./qualify-sdk-package-diagnostics');
const diagnostic = (stderr) =>
  installFailureDiagnostic({ status: 1, signal: null, stdout: '', stderr });
const request = (url) => `npm error 404 Not Found - GET ${url} - Not found`;

test('public identity extraction rejects credentials, query, fragments, paths, and nonpublic registries', () => {
  for (const url of [
    'https://token@registry.npmjs.org/pkg',
    'https://user:token@registry.npmjs.org/pkg',
    'https://registry.npmjs.org/pkg?token=private',
    'https://registry.npmjs.org/pkg#private',
    'https://registry.npmjs.org:443/pkg',
    'http://registry.npmjs.org/pkg',
    'https://registry.npmjs.org.evil/pkg',
    'https://registry.invalid/pkg',
    'https://registry.npmjs.org/../private',
    'https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz',
    'https://registry.npmjs.org/%70kg',
    `https://registry.npmjs.org/${'x'.repeat(215)}`,
  ])
    assert.deepEqual(diagnostic(request(url)).publicRegistryRequests, []);
});

test('version is exact and correlated with a public request; unrelated text stays private', () => {
  for (const version of [
    '*',
    'file:/private/token',
    'https://user:token@host/pkg',
    '1.2.3?token=private',
  ]) {
    const value = diagnostic(
      `${request('https://registry.npmjs.org/pkg')}\nnpm error 404 'pkg@${version}' is not in this registry.`
    );
    assert.deepEqual(value.publicRegistryRequests, [
      { registry: 'https://registry.npmjs.org', package: 'pkg', version: null },
    ]);
  }
  assert.deepEqual(
    diagnostic("npm error 404 'private@1.2.3' is not in this registry.")
      .publicRegistryRequests,
    []
  );
  assert.deepEqual(
    diagnostic(
      `${request('https://registry.npmjs.org/pkg')}\nnpm error 404 'other@1.2.3' is not in this registry.`
    ).publicRegistryRequests,
    [{ registry: 'https://registry.npmjs.org', package: 'pkg', version: null }]
  );
});

test('identity count, prefix parsing, and code allowlist stay bounded', () => {
  const lines = Array.from({ length: 20 }, (_, i) =>
    request(`https://registry.npmjs.org/pkg${i}`)
  );
  assert.equal(diagnostic(lines.join('\n')).publicRegistryRequests.length, 8);
  assert.deepEqual(
    diagnostic(`${'x'.repeat(4096)}\n${lines[0]}`).publicRegistryRequests,
    []
  );
  assert.equal(diagnostic('npm error code SECRET').npmCode, null);
  assert.equal(diagnostic('npm ERR! code E404').npmCode, 'E404');
  assert.deepEqual(
    diagnostic(
      request('https://registry.npmjs.org/pkg').replace('npm error', 'npm ERR!')
    ).publicRegistryRequests,
    [{ registry: 'https://registry.npmjs.org', package: 'pkg', version: null }]
  );
});
