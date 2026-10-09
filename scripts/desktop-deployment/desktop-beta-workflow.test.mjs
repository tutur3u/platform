import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const workflow = await readFile(
  new URL('../../.github/workflows/desktop-beta.yaml', import.meta.url),
  'utf8'
);
function step(name) {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  assert(start >= 0, `Missing required step: ${name}`);
  const next = workflow.indexOf('\n      - ', start + marker.length);
  return workflow.slice(start, next < 0 ? undefined : next);
}
function condition(section) {
  return section.match(/^ {8}if: (.+)$/m)?.[1];
}
const early = step('Require desktop signing configuration');
const late = step('Require Windows signing configuration');
const readiness = (section) =>
  section.match(/^ {10}SIGNING_READY: \$\{\{ (.+) \}\}$/m)?.[1];
const windowsBuild = step('Build Windows beta');
const upload = step('Upload isolated beta package');
const publish = workflow.split('\n  publish:\n')[1];

function ready(platform, source, pfx, password, windowsVault, macosVault) {
  return runInNewContext(readiness(late), {
    matrix: { platform },
    vars: {
      DESKTOP_SIGNING_SOURCE: source,
      MACOS_SIGNING_IDENTITY: 'synthetic-identity',
      APPLE_TEAM_ID: 'synthetic-team',
    },
    secrets: {
      WINDOWS_SIGNING_CERTIFICATE_PFX_B64: pfx ? 'synthetic-present' : '',
      WINDOWS_SIGNING_CERTIFICATE_PASSWORD: password ? 'synthetic-present' : '',
      DESKTOP_WINDOWS_VAULT_CI_TOKEN: windowsVault ? 'synthetic-present' : '',
      DESKTOP_MACOS_VAULT_CI_TOKEN: macosVault ? 'synthetic-present' : '',
      MACOS_CERTIFICATE_P12_B64: 'synthetic-present',
      MACOS_CERTIFICATE_PASSWORD: 'synthetic-present',
      APP_STORE_CONNECT_API_KEY_ID: 'synthetic-present',
      APP_STORE_CONNECT_ISSUER_ID: 'synthetic-present',
      APP_STORE_CONNECT_PRIVATE_KEY_P8_B64: 'synthetic-present',
    },
  });
}

test('only Windows defers identical strict signing readiness until after compile', () => {
  assert.equal(condition(early), "matrix.platform != 'windows'");
  assert.equal(condition(late), "matrix.platform == 'windows'");
  assert.equal(readiness(early), readiness(late));
  assert.ok(readiness(late));
  const position = (name) => workflow.indexOf(`      - name: ${name}\n`);
  assert(
    position('Require desktop signing configuration') <
      position('Build Windows beta')
  );
  assert(
    position('Build Windows beta') <
      position('Require Windows signing configuration')
  );
  for (const name of [
    'Sign Windows beta with Infrastructure vault',
    'Sign and package Windows beta',
    'Upload isolated beta package',
  ]) {
    assert(position('Require Windows signing configuration') < position(name));
  }
  assert.equal(condition(windowsBuild), "matrix.platform == 'windows'");
});

test('direct Windows signing requires both configured certificate and password', () => {
  for (const source of ['', 'environment']) {
    for (const pfx of [false, true]) {
      for (const password of [false, true]) {
        assert.equal(
          ready('windows', source, pfx, password, true, true),
          pfx && password
        );
      }
    }
  }
});

test('vault Windows signing requires its own token without direct-secret fallback', () => {
  assert.equal(ready('windows', 'vault', true, true, false, true), false);
  assert.equal(ready('windows', 'vault', false, false, true, false), true);
  assert.equal(ready('windows', 'vault', false, false, false, true), false);
  assert.equal(ready('linux', 'vault', false, false, false, false), true);
});

test('missing signing readiness fails before all signing and upload effects', () => {
  for (const section of [early, late]) {
    assert.match(section, /if \[ "\$SIGNING_READY" != true \]; then/);
    assert.match(section, /Public beta publication is blocked/);
    assert.match(section, /exit 1/);
    assert.doesNotMatch(section, /continue-on-error|always\(\)|success\(\)/);
  }
  assert.doesNotMatch(upload, /^ {8}if:/m);
  assert.match(upload, /name: desktop-beta-\$\{\{ matrix.platform \}\}/);
  assert.match(upload, /path: \$\{\{ runner.temp \}\}\/desktop-artifacts\/\*/);
  assert.match(upload, /if-no-files-found: error/);
  assert.doesNotMatch(workflow, /continue-on-error:/);
});

test('compile keeps public-only inputs and protected selected-platform eligibility', () => {
  assert.match(
    workflow,
    /if: needs\.release-status\.outputs\.enabled == 'true' && github\.ref == 'refs\/heads\/production'/
  );
  assert.match(
    workflow,
    /matrix: \$\{\{ fromJSON\(needs\.release-status\.outputs\.matrix\) \}\}/
  );
  assert.match(
    workflow,
    /DESKTOP_BETA_PLATFORMS: \$\{\{ vars\.DESKTOP_BETA_PLATFORMS \}\}/
  );
  assert.match(
    windowsBuild,
    /flutter build windows --release --target lib\/main_production\.dart/
  );
  assert.match(
    windowsBuild,
    /--dart-define-from-file="\$env:RUNNER_TEMP\/desktop-public\.json"/
  );
  assert.doesNotMatch(windowsBuild, /secrets\.|SIGNING|VAULT|certificate/i);
  assert.match(
    step('Install Flutter dependencies'),
    /flutter pub get --enforce-lockfile/
  );
  assert.match(
    step('Validate public build configuration'),
    /write-ci-config\.mjs/
  );
});

test('Windows signing source branches and verified upload remain strict', () => {
  assert.equal(
    condition(step('Sign Windows beta with Infrastructure vault')),
    "matrix.platform == 'windows' && vars.DESKTOP_SIGNING_SOURCE == 'vault'"
  );
  assert.equal(
    condition(step('Sign and package Windows beta')),
    "matrix.platform == 'windows' && vars.DESKTOP_SIGNING_SOURCE != 'vault'"
  );
  assert.match(
    step('Sign Windows beta with Infrastructure vault'),
    /package-vault-ci\.mjs/
  );
  assert.match(step('Sign and package Windows beta'), /package-ci\.mjs/);
  assert.match(
    publish,
    /node scripts\/desktop-deployment\/verify-publication\.mjs/
  );
  assert.match(
    publish,
    /node scripts\/desktop-deployment\/verify-provenance\.mjs/
  );
  assert.match(publish, /actions\/attest-build-provenance@/);
});

test('failed matrix still permits only an existing verified subset, never empty publication', () => {
  assert.match(publish, /needs: \[build, release-status\]/);
  const expression = publish.match(/^ {4}if: (.+)$/m)[1];
  for (const result of ['success', 'failure', 'skipped', 'cancelled']) {
    const allowed = runInNewContext(
      expression.replaceAll('needs.release-status', 'needs["release-status"]'),
      {
        always: () => true,
        cancelled: () => false,
        needs: {
          build: { result },
          'release-status': { outputs: { enabled: 'true' } },
        },
        github: { ref: 'refs/heads/production' },
      }
    );
    assert.equal(allowed, result === 'success' || result === 'failure');
  }
  const names = [
    'Select successful verified platforms',
    'Verify publication prerequisites',
    'Attest beta packages',
    'Verify signed beta provenance',
    'Publish immutable beta release',
  ];
  const positions = names.map((name) =>
    publish.indexOf(`      - name: ${name}\n`)
  );
  assert(
    positions.every(
      (position, i) => position >= 0 && (!i || position > positions[i - 1])
    )
  );
  assert.match(publish, /pattern: desktop-beta-\*/);
  assert.doesNotMatch(publish, /continue-on-error:/);
});
