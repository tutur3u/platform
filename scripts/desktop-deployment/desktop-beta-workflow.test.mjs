import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { evaluateExpression } from '../ci/github-expression-test-helper.js';

const workflow = await readFile(
  new URL('../../.github/workflows/desktop-beta.yaml', import.meta.url),
  'utf8'
);
const build = workflow.split('\n  build:\n')[1].split('\n  publish:\n')[0];
const publish = workflow.split('\n  publish:\n')[1];
const dryRun = workflow
  .split('\n  windows-dry-run:\n')[1]
  .split('\n  release-status:\n')[0];
function step(name) {
  const marker = `      - name: ${name}\n`;
  const start = build.indexOf(marker);
  assert(start >= 0, `Missing required step: ${name}`);
  const next = build.indexOf('\n      - ', start + marker.length);
  return build.slice(start, next < 0 ? undefined : next);
}

test('Windows compilation uses only public inputs before selecting signing credentials', () => {
  const windows = step('Build Windows beta');
  assert.match(
    windows,
    /flutter build windows --release --target lib\/main_production\.dart/
  );
  assert.match(
    windows,
    /--dart-define-from-file="\$env:RUNNER_TEMP\/desktop-public\.json"/
  );
  assert.doesNotMatch(windows, /secrets\.|SIGNING|VAULT|certificate/i);
  assert(
    build.indexOf('Build Windows beta') <
      build.indexOf('Select Windows signing mode')
  );
  assert(
    build.indexOf('Select Windows signing mode') <
      build.indexOf('Package Windows beta')
  );
  assert.match(
    step('Install Flutter dependencies'),
    /flutter pub get --enforce-lockfile/
  );
  assert.match(
    step('Select Windows signing mode'),
    /WINDOWS_PFX_PRESENT: \$\{\{ secrets.WINDOWS_SIGNING_CERTIFICATE_PFX_B64 != '' \}\}/
  );
  assert.match(step('Select Windows signing mode'), /windows-signing\.mjs/);
});

test('macOS keeps strict signing admission and Windows retains separate direct and vault steps', () => {
  const early = step('Require desktop signing configuration');
  assert.match(early, /if: matrix.platform != 'windows'/);
  assert.match(early, /if \[ "\$SIGNING_READY" != true \]; then/);
  assert.match(early, /exit 1/);
  assert.match(
    step('Sign Windows beta with Infrastructure vault'),
    /steps.windows-signing.outputs.mode == 'vault'/
  );
  assert.match(
    step('Sign Windows beta with Infrastructure vault'),
    /secrets.DESKTOP_WINDOWS_VAULT_CI_TOKEN/
  );
  assert.match(
    step('Package Windows beta'),
    /vars.DESKTOP_SIGNING_SOURCE != 'vault'/
  );
  assert.match(step('Package Windows beta'), /package-ci\.mjs/);
  assert.match(step('Sign and notarize macOS beta'), /package-ci\.mjs/);
  assert.doesNotMatch(workflow, /continue-on-error:/);
});

test('dry run is manual, Windows-only, unsigned, read-only and cannot enter publication', () => {
  assert.match(workflow, /dry_run:[\s\S]*?type: boolean\n {8}default: true/);
  assert.match(
    dryRun,
    /github.event_name == 'workflow_dispatch' && inputs.dry_run/
  );
  assert.match(dryRun, /runs-on: windows-latest/);
  assert.match(dryRun, /permissions:\n {6}contents: read/);
  assert.doesNotMatch(
    dryRun,
    /environment:|secrets\.|id-token:|contents: write|publish\.mjs|package-vault/
  );
  assert.match(dryRun, /verify-publication\.mjs/);
  assert.match(dryRun, /name: desktop-windows-x64-dry-run/);
  assert.match(dryRun, /if-no-files-found: error/);
  assert.match(dryRun, /retention-days: 7/);
  const availability = workflow
    .split('\n  release-status:\n')[1]
    .split('\n  build:\n')[0];
  assert.match(
    availability,
    /github.ref == 'refs\/heads\/production' && !inputs.dry_run/
  );
  assert.match(build, /needs: \[check-ci, validate, release-status\]/);
  assert.match(publish, /github.ref == 'refs\/heads\/production'/);
});

test('public releases keep selected-platform matrix, checked receipts and provenance gates', () => {
  assert.match(
    build,
    /matrix: \$\{\{ fromJSON\(needs.release-status.outputs.matrix\) \}\}/
  );
  assert.match(
    workflow,
    /DESKTOP_BETA_PLATFORMS: \$\{\{ vars.DESKTOP_BETA_PLATFORMS \}\}/
  );
  const upload = step('Upload isolated beta package');
  assert.match(upload, /name: desktop-beta-\$\{\{ matrix.platform \}\}/);
  assert.match(upload, /if-no-files-found: error/);
  assert.match(upload, /retention-days: 7/);
  assert.match(publish, /verify-publication\.mjs/);
  assert.match(publish, /verify-provenance\.mjs/);
  assert.match(publish, /actions\/attest-build-provenance@/);
});

test('failed matrix still permits only an existing verified subset, never empty publication', () => {
  assert.match(publish, /needs: \[build, release-status\]/);
  const expression = publish.match(/^ {4}if: (.+)$/m)[1];
  const events = [
    { eventName: 'push', labels: [], admitted: true },
    { eventName: 'workflow_dispatch', labels: [], admitted: true },
    { eventName: 'pull_request', labels: [], admitted: false },
    { eventName: 'pull_request', labels: ['unrelated'], admitted: false },
    { eventName: 'pull_request', labels: ['ready-for-ci'], admitted: true },
    {
      eventName: 'pull_request',
      labels: ['unrelated', 'ready-for-ci'],
      admitted: true,
    },
  ];
  for (const result of ['success', 'failure', 'skipped', 'cancelled']) {
    for (const { eventName, labels, admitted } of events) {
      const allowed = evaluateExpression(expression, {
        needs: {
          build: { result },
          'release-status': { outputs: { enabled: 'true' } },
        },
        github: {
          ref: 'refs/heads/production',
          event_name: eventName,
          event:
            eventName === 'pull_request'
              ? { pull_request: { labels: labels.map((name) => ({ name })) } }
              : {},
        },
      });
      assert.equal(
        allowed,
        admitted && (result === 'success' || result === 'failure'),
        `${eventName}, labels=${labels.join(',')}, build=${result}`
      );
    }
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
