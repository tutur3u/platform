const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  formatResult,
  listAppEnvTargets,
  parseArgs,
  runCli,
  syncAppEnvFiles,
} = require('./sync-app-envs');

function createFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-app-envs-'));
  for (const app of ['web', 'chat', 'cms', 'learn']) {
    fs.mkdirSync(path.join(rootDir, 'apps', app), { recursive: true });
    fs.writeFileSync(
      path.join(rootDir, 'apps', app, 'package.json'),
      JSON.stringify({ name: `@tuturuuu/${app}` })
    );
  }
  fs.writeFileSync(
    path.join(rootDir, 'apps', 'web', '.env.local'),
    'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\nSECRET=from-web\n'
  );
  fs.writeFileSync(
    path.join(rootDir, 'apps', 'chat', '.env.local'),
    'SECRET=old-chat\n'
  );
  fs.writeFileSync(
    path.join(rootDir, 'apps', 'cms', '.env.local'),
    'SECRET=old-cms\n'
  );
  return rootDir;
}

test('listAppEnvTargets finds existing app env files and excludes the source', () => {
  const rootDir = createFixture();

  assert.deepEqual(
    listAppEnvTargets({ rootDir }).map((target) => target.relativePath),
    ['apps/chat/.env.local', 'apps/cms/.env.local']
  );
});

test('syncAppEnvFiles dry-run does not overwrite target env files', () => {
  const rootDir = createFixture();
  const result = syncAppEnvFiles({ dryRun: true, rootDir });

  assert.equal(result.dryRun, true);
  assert.equal(result.targets.length, 2);
  assert.equal(
    fs.readFileSync(path.join(rootDir, 'apps', 'chat', '.env.local'), 'utf8'),
    'SECRET=old-chat\n'
  );
});

test('syncAppEnvFiles copies apps/web env to existing app env files', () => {
  const rootDir = createFixture();

  syncAppEnvFiles({ rootDir });

  const source = fs.readFileSync(
    path.join(rootDir, 'apps', 'web', '.env.local'),
    'utf8'
  );
  assert.equal(
    fs.readFileSync(path.join(rootDir, 'apps', 'chat', '.env.local'), 'utf8'),
    source
  );
  assert.equal(
    fs.readFileSync(path.join(rootDir, 'apps', 'cms', '.env.local'), 'utf8'),
    source
  );
  assert.equal(
    fs.existsSync(path.join(rootDir, 'apps', 'learn', '.env.local')),
    false
  );
});

test('syncAppEnvFiles can include missing app env files', () => {
  const rootDir = createFixture();

  const result = syncAppEnvFiles({ includeMissing: true, rootDir });

  assert.ok(
    result.targets.some(
      (target) =>
        target.relativePath === 'apps/learn/.env.local' &&
        target.exists === false
    )
  );
  assert.equal(
    fs.readFileSync(path.join(rootDir, 'apps', 'learn', '.env.local'), 'utf8'),
    fs.readFileSync(path.join(rootDir, 'apps', 'web', '.env.local'), 'utf8')
  );
});

test('formatResult makes dry-run output explicit', () => {
  assert.match(
    formatResult({
      dryRun: true,
      source: 'apps/web/.env.local',
      targets: [
        {
          exists: true,
          relativePath: 'apps/chat/.env.local',
        },
      ],
    }),
    /Would copy apps\/web\/\.env\.local/u
  );
});

test('parseArgs supports dry-run, include-missing, and overrides', () => {
  assert.deepEqual(
    parseArgs([
      '--dry-run',
      '--include-missing',
      '--source',
      'apps/chat/.env.local',
      '--env-file=.env.development',
    ]),
    {
      dryRun: true,
      envFileName: '.env.development',
      includeMissing: true,
      source: 'apps/chat/.env.local',
    }
  );
});

test('runCli reports missing source files as failures', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-app-envs-'));
  const errors = [];
  const logs = [];
  const code = runCli({
    error: (message) => errors.push(message),
    log: (message) => logs.push(message),
    rootDir,
  });

  assert.equal(code, 1);
  assert.match(errors.join('\n'), /Missing source env file/u);
  assert.equal(logs.length, 0);
});
