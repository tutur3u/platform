const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { repoRoot } = require('./workflow-config-test-helpers.js');

const workerApps = [
  'ai',
  'apps',
  'chat',
  'cms',
  'contacts',
  'drive',
  'finance',
  'forms',
  'git',
  'inventory',
  'learn',
  'mail',
  'marketing',
  'meet',
  'mind',
  'nova',
  'rewise',
  'shortener',
  'storefront',
  'tasks',
  'teach',
  'tools',
  'track',
  'workspace',
];

const workerBuildOverrides = {
  apps: ['build:cloudflare', 'vp build'],
  mail: ['build', 'bun run bridge:check && vp build'],
  meet: ['build:cloudflare', 'vp build'],
  mind: [
    'build:cloudflare',
    'vp build --configLoader runner && node cloudflare/prepare-server-artifact.mjs',
  ],
  shortener: ['build:cloudflare', 'vp build'],
};

test('Worker apps preserve their package build recipes and retire Git deploy configs', () => {
  const root = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json')));
  assert.match(root.packageManager, /^bun@/);
  assert.ok(fs.existsSync(path.join(repoRoot, 'bun.lock')));
  for (const app of workerApps) {
    const directory = path.join(repoRoot, 'apps', app);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(directory, 'package.json'))
    );
    assert.match(manifest.name, /^@tuturuuu\//);
    const [script, command] = workerBuildOverrides[app] ?? [
      'build:cloudflare',
      'vp build --configLoader runner',
    ];
    assert.equal(
      manifest.scripts[script],
      command,
      `${app} Worker build recipe`
    );
    assert.ok(fs.existsSync(path.join(directory, 'void.config.ts')));
    assert.ok(!fs.existsSync(path.join(directory, 'vercel.json')));
  }
});

const retainedBuildCommands = {
  admin: 'cd ../.. && bun turbo:local run build --filter=@tuturuuu/admin',
  calendar:
    "cd ../.. && bun turbo:local run build --filter='@tuturuuu/calendar^...' && bun run --cwd apps/calendar build:legacy",
  external:
    'cd ../.. && bun turbo:local run build --filter="@tuturuuu/external^..." && bun run --cwd apps/external build:legacy',
  pay: 'cd ../.. && bun turbo:local run build --filter=@tuturuuu/pay',
  playground: undefined,
  'tanstack-web':
    'cd ../.. && bun turbo:local run build --filter=@tuturuuu/tanstack-web',
};

test('Retained app configs disable provider-owned GitHub builds', () => {
  const appsRoot = path.join(repoRoot, 'apps');
  const vercelJsonPaths = fs
    .readdirSync(appsRoot)
    .map((appName) => path.join(appsRoot, appName, 'vercel.json'))
    .filter((vercelJsonPath) => fs.existsSync(vercelJsonPath));

  assert.deepEqual(
    vercelJsonPaths.map((file) => path.basename(path.dirname(file))).sort(),
    Object.keys(retainedBuildCommands).sort()
  );

  for (const vercelJsonPath of vercelJsonPaths) {
    const relativePath = path.relative(repoRoot, vercelJsonPath);
    const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
    const app = path.basename(path.dirname(vercelJsonPath));
    assert.equal(vercelConfig.buildCommand, retainedBuildCommands[app], app);
    assert.equal(
      vercelConfig.installCommand,
      ['external', 'playground'].includes(app)
        ? undefined
        : 'cd ../.. && bun install --frozen-lockfile --minimum-release-age=0',
      app
    );
    if (app === 'calendar') {
      assert.deepEqual(vercelConfig.routes, [
        { src: '^/api/(.*)$', dest: '/calendar/api/$1', continue: true },
      ]);
      assert.equal(vercelConfig.crons, undefined);
    }
    if (app === 'external') {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(path.dirname(vercelJsonPath), 'package.json'))
      );
      assert.equal(manifest.scripts['build:legacy'], 'next build --turbopack');
    }

    assert.equal(
      vercelConfig.git?.deploymentEnabled,
      false,
      `${relativePath} must let GitHub Actions own deployments`
    );
    assert.equal(
      vercelConfig.github?.enabled,
      false,
      `${relativePath} must disable Vercel GitHub auto-builds`
    );
  }
});
