const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { discoverScriptTests } = require('./run-script-tests');
const { updatePlan } = require('./package-update');
const { isPausedImplementationTest } = require('./paused-runtimes');
const { command } = require('./local-docs');

const root = path.resolve(__dirname, '..');

test('default script discovery excludes inactive implementation suites', () => {
  const files = discoverScriptTests({ repoRoot: root });
  for (const file of files)
    assert.equal(isPausedImplementationTest(file), false, file);
  for (const file of [
    'scripts/docker-docs.test.js',
    'scripts/check-backend.test.js',
    'scripts/tanstack-migration-manifest.test.js',
    'scripts/watch-blue-green-deploy.test.js',
  ]) {
    assert.equal(files.includes(file), false, file);
  }
  assert.ok(files.includes('scripts/ci/paused-migration-workflows.test.js'));
});

test('dependency updater explicitly targets maintained workspaces only', () => {
  const args = updatePlan(root);
  assert.equal(args[0], 'update');
  assert.ok(args.includes('--filter=@tuturuuu/web'));
  assert.ok(args.includes('--filter=tutur3u'));
  assert.ok(
    args.every(
      (arg) => !arg.includes('tanstack-web') && !arg.includes('backend')
    )
  );
  for (const file of [
    'scripts/package-update.sh',
    'scripts/package-update.bat',
  ]) {
    assert.match(
      fs.readFileSync(path.join(root, file), 'utf8'),
      /package-update\.js/
    );
  }
});

test('automated dependency maintenance cannot target paused apps or Dockerfiles', () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, 'renovate.json'), 'utf8')
  );
  assert.equal(config.lockFileMaintenance.enabled, false);
  for (const glob of [
    'apps/backend/**',
    'apps/tanstack-web/**',
    '**/Dockerfile',
    '**/*.Dockerfile',
  ])
    assert.ok(config.ignorePaths.includes(glob));
});

test('paused root commands fail visibly without running an inactive service', () => {
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'scripts/paused-runtimes.js'), 'docker'],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /paused and not in use/);
  const { scripts } = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8')
  );
  assert.equal(scripts['dev:docs'], 'node scripts/local-docs.js');
  for (const name of [
    'check:docker',
    'check:backend',
    'dev:tanstack-web',
    'migration:tanstack:manifest',
    'test:e2e:web:docker',
  ])
    assert.match(scripts[name], /paused-runtimes\.js/);
  assert.doesNotMatch(scripts['test:e2e'], /docker/i);
});

test('local docs uses a pinned CLI, bounded ports, and no container command', () => {
  const plan = command(['--port', '3333', '--print-command'], '24.0.0');
  assert.match(plan.args[1], /^mintlify@\d+\.\d+\.\d+$/);
  assert.deepEqual(plan.args.slice(2), ['dev', '--port', '3333']);
  assert.equal(plan.cwd, path.join(root, 'apps/docs'));
  assert.equal(command(['broken-links']).args.at(-1), 'broken-links');
  assert.deepEqual(command([], '25.0.0').args.slice(0, 4), [
    '--yes',
    '--package=node@24',
    `--package=${plan.args[1]}`,
    'mintlify',
  ]);
  assert.throws(() => command(['--port', '0']), /Port/);
  assert.throws(() => command(['--port', '3000;docker']), /Port/);
});

test('direct Vitest and the unified check runner omit paused implementation checks', () => {
  const config = fs.readFileSync(path.join(root, 'vitest.config.ts'), 'utf8');
  assert.match(config, /backend/);
  assert.match(config, /tanstack-web/);
  assert.match(config, /!.*includes\(entry.name\)/);
  const runner = fs.readFileSync(path.join(root, 'scripts/check.js'), 'utf8');
  assert.doesNotMatch(runner, /name: 'tanstack-api-access'/);
  assert.ok(
    isPausedImplementationTest('scripts/check-tanstack-api-access.test.js')
  );
  assert.ok(isPausedImplementationTest('scripts/ci/e2e-image-bundle.test.js'));
  assert.ok(
    isPausedImplementationTest('scripts/ci/rust-verification-workflow.test.js')
  );
});

test('Release Please does not write versions or changelogs to inactive apps', () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, 'release-please-config.json'), 'utf8')
  );
  assert.equal(config.packages['apps/backend'], undefined);
  assert.equal(config.packages['apps/tanstack-web'], undefined);
});
