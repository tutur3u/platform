import assert from 'node:assert/strict';
import { test } from 'node:test';
import { packageWindows } from './package-windows.mjs';
import { windowsSigningMode } from './windows-signing.mjs';

const configuration = { bundle: 'bundle', output: 'output', version: '1.0.0' };
const credentials = {
  WINDOWS_SIGNING_CERTIFICATE_PFX_B64: 'synthetic-certificate',
  WINDOWS_SIGNING_CERTIFICATE_PASSWORD: 'synthetic-password',
};

test('absent credentials package an explicitly unsigned installer without a signer', () => {
  const calls = [];
  const verification = packageWindows({
    ...configuration,
    env: {},
    execute: (...args) => calls.push(args),
  });
  assert.equal(verification, 'unsigned-windows');
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /ISCC.exe$/);
  assert.ok(
    calls[0][1].includes('scripts/desktop-deployment/windows-installer.iss')
  );
});

test('configured signing signs both the app bundle and completed installer', () => {
  const calls = [];
  assert.equal(
    packageWindows({
      ...configuration,
      env: credentials,
      execute: (...args) => calls.push(args),
    }),
    'authenticode-timestamped'
  );
  assert.equal(calls.length, 3);
  assert.equal(calls[0][0], 'pwsh');
  assert.equal(calls[0][1].at(-1), 'bundle');
  assert.match(calls[1][0], /ISCC.exe$/);
  assert.equal(calls[2][0], 'pwsh');
  assert.match(calls[2][1].at(-1), /Tuturuuu-windows-x64-setup.exe$/);
});

test('partial credentials fail before packaging and signing failure never downgrades', () => {
  for (const name of Object.keys(credentials)) {
    assert.throws(
      () =>
        packageWindows({
          ...configuration,
          env: { [name]: credentials[name] },
          execute: () => assert.fail('must not execute'),
        }),
      /both Windows/
    );
  }
  for (const failedCall of [1, 3]) {
    let calls = 0;
    assert.throws(
      () =>
        packageWindows({
          ...configuration,
          env: credentials,
          execute: () => {
            if (++calls === failedCall) throw new Error('signing failed');
          },
        }),
      /signing failed/
    );
    assert.equal(calls, failedCall);
  }
});

test('vault opt-in requires its own credential and never falls back to direct or unsigned', () => {
  assert.equal(windowsSigningMode({ source: 'vault', vault: true }), 'vault');
  assert.throws(
    () =>
      windowsSigningMode({
        source: 'vault',
        vault: false,
        certificate: true,
        password: true,
      }),
    /own token/
  );
  assert.throws(() => windowsSigningMode({ source: 'unknown' }), /Unknown/);
});
