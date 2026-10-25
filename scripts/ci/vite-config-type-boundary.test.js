const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
function projectFiles(app, project) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        path.join(root, 'node_modules/typescript/bin/tsc'),
        '--showConfig',
        '--project',
        `apps/${app}/${project}`,
      ],
      { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
    )
  ).files;
}
for (const [app, project, configs, appFile] of [
  [
    'mail',
    'tsconfig.json',
    ['vite.config.ts', 'void.config.ts', 'vitest.config.ts', 'next.config.ts'],
    'src/lib/mail/calendar-link-client.test.ts',
  ],
  [
    'calendar',
    'tsconfig.json',
    ['vite.config.mts', 'void.config.ts'],
    'src/lib/calendar/provider-sync-network.test.ts',
  ],
  [
    'meet',
    'tsconfig.app.json',
    ['vite.config.ts', 'void.config.ts', 'void.staging.config.ts'],
    'src/runtime/native-function-config.ts',
  ],
]) {
  test(`${app}: app roots exclude host tooling while its normal gate checks every config`, () => {
    const appFiles = projectFiles(app, project).map((file) =>
      file.replace(/^\.\//u, '')
    );
    assert.ok(appFiles.includes(appFile), 'Preserve app and test coverage');
    for (const config of configs)
      assert.ok(!appFiles.includes(config), `${config} leaked into app roots`);
    const configFiles = projectFiles(app, 'tsconfig.config.json').map((file) =>
      file.replace(/^\.\//u, '')
    );
    assert.deepEqual(configFiles.sort(), [...configs].sort());
    const { scripts } = JSON.parse(
      fs.readFileSync(path.join(root, `apps/${app}/package.json`), 'utf8')
    );
    assert.match(scripts['type-check'], /&& bun run type-check:config$/u);
    assert.match(
      scripts['type-check:config'],
      /tsc --noEmit --project tsconfig\.config\.json$/u
    );
  });
}
