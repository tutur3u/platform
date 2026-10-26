const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');
// Vite is a declared root dependency and owns this locked matcher.
const picomatch = createRequire(require.resolve('vite'))('picomatch');
const workflow = readWorkflow('pr-checks.yaml', { raw: true });
const filters = JSON.parse(
  execFileSync(
    'bun',
    [
      '-e',
      'console.log(JSON.stringify(Bun.YAML.parse(process.argv[1])))',
      workflow.jobs.scope.steps[0].with.filters,
    ],
    { encoding: 'utf8' }
  )
);
const matches = (patterns, file) => picomatch(patterns, { dot: true })(file);
const common = {
  '.github/**': [
    '.github/workflows/pr-checks.yaml',
    '.github/actions/test/action.yml',
  ],
  'package.json': ['package.json'],
  'bun.lock': ['bun.lock'],
};
const cases = {
  biome: {
    ...common,
    '**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx,json,jsonc,css,graphql,gql}': [
      'scripts/check.js',
      '.ci/policy.json',
      'packages/ui/src/view.tsx',
      'apps/web/messages/en.json',
    ],
    '.editorconfig': ['.editorconfig'],
    '.gitignore': ['.gitignore'],
  },
  i18n: {
    ...common,
    'apps/*/messages/**': ['apps/web/messages/en.json'],
    'packages/*/messages/**': ['packages/ui/messages/vi.json'],
    'apps/*/src/**': ['apps/mail/src/routes/index.tsx'],
    'packages/*/src/**': ['packages/ui/src/button.tsx'],
    'apps/*/package.json': ['apps/mail/package.json'],
    'packages/*/package.json': ['packages/ui/package.json'],
    'scripts/i18n-*': ['scripts/i18n-rendered-keys.js'],
    'i18n-*.json': ['i18n-namespace-check.config.json'],
    'scripts/run-i18n-check.js': ['scripts/run-i18n-check.js'],
  },
  docs: {
    ...common,
    'apps/docs/**': ['apps/docs/platform/overview.mdx'],
    'apps/*/src/app/**': ['apps/web/src/app/sitemap.ts'],
    'apps/*/public/**': ['apps/web/public/robots.txt'],
    'apps/*/package.json': ['apps/mail/package.json'],
    'packages/*/package.json': ['packages/sdk/package.json'],
    'apps/*/next.config.*': ['apps/mail/next.config.ts'],
    'packages/utils/**': ['packages/utils/src/seo-policy.json'],
    'scripts/docs-*': ['scripts/docs-audit.js'],
    'scripts/generate-*': ['scripts/generate-docs-inventory.js'],
    'scripts/local-docs*': ['scripts/local-docs.js'],
    'scripts/paused-*': ['scripts/paused-runtimes.js'],
    'scripts/ci/paused-*': ['scripts/ci/paused-migration-workflows.test.js'],
    'scripts/ci/release-docs-*': ['scripts/ci/release-docs-inventory.js'],
    'scripts/ci/cf-adoption-*': ['scripts/ci/cf-adoption-docs.test.js'],
    'apps/mobile/pubspec.*': [
      'apps/mobile/pubspec.yaml',
      'apps/mobile/pubspec.lock',
    ],
    'apps/discord/pyproject.toml': ['apps/discord/pyproject.toml'],
    'apps/discord/uv.lock': ['apps/discord/uv.lock'],
    'scripts/safe-fs.js': ['scripts/safe-fs.js'],
  },
  migrations: {
    '.github/**': common['.github/**'],
    'apps/database/supabase/migrations/**.sql': [
      'apps/database/supabase/migrations/20261027000000_change.sql',
    ],
    'scripts/check-migration-timestamps*': [
      'scripts/check-migration-timestamps.js',
    ],
    'tuturuuu*.ts': ['tuturuuu.ts', 'tuturuuu.ci.ts'],
  },
  mobile: {
    '.github/**': common['.github/**'],
    'package.json': common['package.json'],
    'apps/mobile/lib/core/config/api_config.dart': [
      'apps/mobile/lib/core/config/api_config.dart',
    ],
    'apps/*/src/app/api/**': ['apps/pay/src/app/api/payment/route.ts'],
    'apps/web/src/legacy-api-routes/**': [
      'apps/web/src/legacy-api-routes/example/route.ts',
    ],
    'apps/tanstack-web/migration/route-manifest.json': [
      'apps/tanstack-web/migration/route-manifest.json',
    ],
    'packages/sdk/src/**': ['packages/sdk/src/client.ts'],
    'scripts/check-mobile-api-mappings.*': [
      'scripts/check-mobile-api-mappings.js',
    ],
    'tuturuuu*.ts': ['tuturuuu.ts', 'tuturuuu.ci.ts'],
  },
  plugin: {
    '.github/**': common['.github/**'],
    'plugins/**': ['plugins/tuturuuu/scripts/validate_plugin.py'],
    '.agents/**': ['.agents/plugins/marketplace.json'],
    '.claude/**': ['.claude/settings.json'],
    '.claude-plugin/**': ['.claude-plugin/marketplace.json'],
    '.codex/**': ['.codex/config.toml'],
    'skills.sh.json': ['skills.sh.json'],
    'apps/docs/build/skills/**': ['apps/docs/build/skills/installation.mdx'],
    'apps/docs/build/development-tools/codex-plugin.mdx': [
      'apps/docs/build/development-tools/codex-plugin.mdx',
    ],
    'apps/docs/build/development-tools/git-conventions.mdx': [
      'apps/docs/build/development-tools/git-conventions.mdx',
    ],
    'AGENTS.md': ['AGENTS.md'],
    'apps/docs/docs.json': ['apps/docs/docs.json'],
    'tuturuuu*.ts': ['tuturuuu.ts', 'tuturuuu.ci.ts'],
  },
};

for (const [category, patterns] of Object.entries(cases)) {
  test(`${category}: every configured pattern has a positive regression case`, () => {
    assert.deepEqual(
      [...filters[category]].sort(),
      Object.keys(patterns).sort()
    );
  });
  for (const [pattern, files] of Object.entries(patterns)) {
    test(`${category}: ${pattern} selects its inputs`, () => {
      assert.ok(
        filters[category].includes(pattern),
        `missing selector ${pattern}`
      );
      for (const file of files) {
        assert.ok(matches(pattern, file), `invalid positive fixture ${file}`);
        assert.ok(matches(filters[category], file), `missed ${file}`);
      }
    });
  }
}

test('unrelated prose and mobile screen edits do not select unrelated checks', () => {
  for (const category of ['biome', 'i18n', 'migrations', 'mobile', 'plugin'])
    assert.equal(
      matches(filters[category], 'apps/docs/platform/overview.mdx'),
      false,
      category
    );
  for (const category of ['i18n', 'docs', 'migrations', 'mobile', 'plugin'])
    assert.equal(
      matches(filters[category], 'apps/mobile/lib/screens/home.dart'),
      false,
      category
    );
  assert.equal(matches(filters.biome, 'README.md'), false);
});
