const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function extractRegisteredApps(source) {
  const match = source.match(/const REGISTERED_APPS = \[([\s\S]*?)\n\];/u);
  assert.ok(
    match,
    'REGISTERED_APPS must remain discoverable by the guard test'
  );

  return new Set(
    [...match[1].matchAll(/'([^']+)'/gu)].map((entry) => entry[1])
  );
}

function extractWorkspaceAwareSatelliteApps(source) {
  const arrayMatch = source.match(
    /export const LAUNCHABLE_APPS = \[([\s\S]*?)\n\] as const/u
  );
  assert.ok(
    arrayMatch,
    'LAUNCHABLE_APPS must remain discoverable by the guard test'
  );

  return new Set(
    arrayMatch[1]
      .split('\n  },')
      .filter((block) => /workspacePathResolver:/u.test(block))
      .map((block) => block.match(/appRoot: 'apps\/([^']+)'/u)?.[1])
      .filter((app) => app && app !== 'web')
  );
}

test('internal app auth guard covers every workspace-aware satellite', () => {
  const registeredApps = extractRegisteredApps(
    read('scripts/check-internal-app-auth.js')
  );
  const workspaceAwareApps = extractWorkspaceAwareSatelliteApps(
    read('packages/utils/src/launchable-apps.ts')
  );

  assert.deepEqual(
    [...registeredApps].filter((app) => workspaceAwareApps.has(app)).sort(),
    [...workspaceAwareApps].sort()
  );
});

test('shared current-user APIs accept every workspace-aware satellite target', () => {
  const workspaceAwareApps = extractWorkspaceAwareSatelliteApps(
    read('packages/utils/src/launchable-apps.ts')
  );
  const sessionAuthSource = read(
    'apps/web/src/legacy-api-routes/v1/users/me/session-auth.ts'
  );
  const targetsMatch = sessionAuthSource.match(
    /const CURRENT_USER_APP_SESSION_TARGETS = \[([\s\S]*?)\n\] as const/u
  );
  assert.ok(
    targetsMatch,
    'CURRENT_USER_APP_SESSION_TARGETS must remain discoverable by the guard test'
  );
  const currentUserTargets = new Set(
    [...targetsMatch[1].matchAll(/'([^']+)'/gu)].map((entry) => entry[1])
  );

  assert.deepEqual(
    [...workspaceAwareApps].filter((app) => !currentUserTargets.has(app)),
    []
  );
});

test('satellite session layouts keep auth behind a request-time boundary', () => {
  const registeredApps = extractRegisteredApps(
    read('scripts/check-internal-app-auth.js')
  );

  for (const app of registeredApps) {
    const appSourceRoot = path.join(ROOT, 'apps', app, 'src');
    if (!fs.existsSync(appSourceRoot)) continue;

    const pending = [appSourceRoot];
    while (pending.length > 0) {
      const currentPath = pending.pop();
      assert.ok(currentPath);

      for (const entry of fs.readdirSync(currentPath, {
        withFileTypes: true,
      })) {
        const entryPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          pending.push(entryPath);
          continue;
        }

        if (entry.name !== 'layout.tsx') continue;

        const source = fs.readFileSync(entryPath, 'utf8');
        const sessionCallIndex = source.indexOf('getSatelliteAppSessionUser(');
        if (sessionCallIndex === -1) continue;

        const connectionCallIndex = source.indexOf('await connection()');
        assert.ok(
          connectionCallIndex !== -1 && connectionCallIndex < sessionCallIndex,
          `${path.relative(ROOT, entryPath)} must call await connection() before satellite session resolution`
        );
        assert.match(
          source,
          /import\s*\{[^}]*\bconnection\b[^}]*\}\s*from\s*['"]next\/server['"]/su,
          `${path.relative(ROOT, entryPath)} must import connection from next/server`
        );
      }
    }
  }
});
