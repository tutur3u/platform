const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  BRANCH_NAME_PATTERN,
  isBranchNameValid,
  nodeScriptTests,
  planChecks,
  siblingTests,
  workspaceOf,
} = require('./plan.js');

const ROOT = path.resolve(__dirname, '../..');

function context(existing = [], overrides = {}) {
  const files = new Set(existing);
  return {
    base: 'abc123',
    biomeBinary: '/repo/node_modules/.bin/biome',
    branch: 'chore/gate',
    exists: (file) => files.has(file),
    hasVitest: (workspace) => workspace !== 'apps/no-vitest',
    ...overrides,
  };
}

const ids = (plan) => plan.steps.map((step) => step.id);
const changed = (...files) => files.map((file) => ({ status: 'M', file }));

test('branch-name pattern mirrors the branch-name-check workflow', () => {
  const workflow = fs.readFileSync(
    path.join(ROOT, '.github/workflows/branch-name-check.yaml'),
    'utf8'
  );
  const match = /\[\[ \$BRANCH_NAME =~ (.+) \]\]/.exec(workflow);
  assert.ok(match, 'workflow regex not found');
  assert.equal(BRANCH_NAME_PATTERN.source, match[1].replaceAll('/', '\\/'));
  assert.equal(isBranchNameValid('chore/tsrs-shadow'), true);
  assert.equal(isBranchNameValid('ci/tsrs-shadow'), false);
  assert.equal(isBranchNameValid('imgbot'), true);
});

test('always runs cheap repository guards and flags bad branch names', () => {
  const plan = planChecks(
    changed('README.md'),
    context([], { branch: 'ci/x' })
  );
  assert.deepEqual(ids(plan), [
    'branch-name',
    'source-size',
    'docs-inventory',
    'app-seo',
  ]);
  assert.equal(plan.steps[0].inline(), false);
  assert.deepEqual(plan.steps[1].args, [
    'scripts/check-source-size.js',
    '--base',
    'abc123',
  ]);
});

test('detached HEAD skips branch validation', () => {
  const plan = planChecks(changed('README.md'), context([], { branch: '' }));
  assert.equal(ids(plan).includes('branch-name'), false);
  assert.deepEqual(plan.skipped[0], ['branch-name', 'detached HEAD']);
});

test('TypeScript changes map to biome, oxlint, guards, vitest and type-check', () => {
  const plan = planChecks(
    changed('packages/utils/src/date.ts', 'apps/web/src/app/page.tsx'),
    context(['packages/utils/src/date.test.ts'])
  );
  assert.deepEqual(ids(plan), [
    'branch-name',
    'source-size',
    'docs-inventory',
    'app-seo',
    'biome',
    'oxlint',
    'internal-app-auth',
    'satellite-cookie-auth',
    'server-console',
    'vitest:packages/utils',
    'type-check:apps/web',
    'type-check:packages/utils',
  ]);
  const biome = plan.steps.find((step) => step.id === 'biome');
  assert.equal(biome.command, '/repo/node_modules/.bin/biome');
  assert.ok(biome.args.includes('--error-on-warnings'));
  const oxlint = plan.steps.find((step) => step.id === 'oxlint');
  assert.equal(oxlint.advisory, true);
  const vitest = plan.steps.find((step) => step.id === 'vitest:packages/utils');
  assert.equal(vitest.cwd, 'packages/utils');
  assert.deepEqual(vitest.args.slice(-1), ['src/date.test.ts']);
  assert.equal(vitest.heavy, true);
});

test('falls back to pinned npx Biome when the local version differs', () => {
  const plan = planChecks(
    changed('scripts/x.js'),
    context([], { biomeBinary: null })
  );
  const biome = plan.steps.find((step) => step.id === 'biome');
  assert.equal(biome.command, 'npx');
  assert.deepEqual(biome.args.slice(0, 2), ['--yes', '@biomejs/biome@2.5.13']);
});

test('deleted and paused-runtime files never reach file-level tools', () => {
  const plan = planChecks(
    [
      { status: 'D', file: 'packages/ui/src/old.tsx' },
      { status: 'M', file: 'apps/tanstack-web/src/router.ts' },
    ],
    context()
  );
  assert.equal(ids(plan).includes('biome'), false);
  assert.equal(ids(plan).includes('type-check:apps/tanstack-web'), false);
  // A deletion can still break importers in its workspace.
  assert.ok(ids(plan).includes('type-check:packages/ui'));
});

test('mobile changes run gen-l10n first, dart format and flutter analyze', () => {
  const plan = planChecks(
    changed(
      'apps/mobile/lib/l10n/arb/app_en.arb',
      'apps/mobile/lib/features/a.dart',
      'apps/mobile/lib/features/a.g.dart',
      'apps/mobile/lib/l10n/gen/app_localizations.dart'
    ),
    context()
  );
  const mobile = plan.steps.filter((step) => step.cwd === 'apps/mobile');
  assert.deepEqual(
    mobile.map((step) => step.id),
    ['flutter-gen-l10n', 'dart-format', 'flutter-analyze']
  );
  assert.deepEqual(mobile[1].args.slice(-1), ['lib/features/a.dart']);
  assert.deepEqual(mobile[2].args, ['analyze', 'lib', 'test']);
  assert.equal(ids(plan).includes('biome'), false);
  assert.ok(ids(plan).includes('mobile-api-mappings'));
  assert.ok(ids(plan).includes('mobile-shadcn-ratchet'));
});

test('web Lucide version changes run the mobile icon sync check', () => {
  for (const file of [
    'bun.lock',
    'apps/mobile/lib/core/ui/icons/generated/lucide_manifest.json',
    'scripts/mobile-lucide/generate.mjs',
  ]) {
    assert.ok(
      ids(planChecks(changed(file), context())).includes('mobile-lucide-sync'),
      file
    );
  }
});

test('path-gated guards cover i18n, migrations, docs and API routes', () => {
  const plan = planChecks(
    changed(
      'apps/web/messages/en.json',
      'apps/database/supabase/migrations/20261023000000_x.sql',
      'apps/docs/build/x.mdx',
      'apps/web/src/app/api/v1/x/route.ts'
    ),
    context()
  );
  for (const id of [
    'i18n-sort',
    'i18n-key-parity',
    'migration-timestamps',
    'docs-audit',
    'api-route-wrappers',
    'mobile-api-mappings',
  ]) {
    assert.ok(ids(plan).includes(id), `missing ${id}`);
  }
});

test('workflow edits run workflow policy tests with changed script tests', () => {
  const plan = planChecks(
    changed('.github/workflows/type-check.yaml', 'scripts/oxc.js'),
    context([
      'scripts/oxc.test.js',
      'scripts/ci/protected-workflow-concurrency.test.js',
      'scripts/ci/bun-workflow-pins.test.js',
      'scripts/ci/check-workflow-config.test.js',
    ])
  );
  const step = plan.steps.find((entry) => entry.id === 'script-tests');
  assert.deepEqual(step.args.slice(2), [
    'scripts/oxc.test.js',
    'scripts/ci/protected-workflow-concurrency.test.js',
    'scripts/ci/bun-workflow-pins.test.js',
    'scripts/ci/check-workflow-config.test.js',
  ]);
});

test('siblingTests finds colocated and __tests__ files', () => {
  const exists = (file) =>
    [
      'packages/ui/src/a.test.tsx',
      'packages/ui/src/__tests__/a.test.ts',
    ].includes(file);
  assert.deepEqual(siblingTests('packages/ui/src/a.tsx', exists), [
    'packages/ui/src/__tests__/a.test.ts',
    'packages/ui/src/a.test.tsx',
  ]);
  assert.deepEqual(siblingTests('packages/ui/src/a.test.tsx', exists), [
    'packages/ui/src/a.test.tsx',
  ]);
  assert.deepEqual(siblingTests('packages/ui/src/a.css', exists), []);
});

test('nodeScriptTests maps scripts to sibling node tests only', () => {
  const exists = (file) =>
    ['scripts/a.test.js', 'scripts/ci/b.test.mjs'].includes(file);
  assert.deepEqual(
    nodeScriptTests(
      ['scripts/a.js', 'scripts/ci/b.mjs', 'packages/x/src/a.ts'],
      exists
    ),
    ['scripts/a.test.js', 'scripts/ci/b.test.mjs']
  );
});

test('workspaceOf recognises apps and packages', () => {
  assert.equal(workspaceOf('apps/web/src/a.ts'), 'apps/web');
  assert.equal(workspaceOf('packages/ui/package.json'), 'packages/ui');
  assert.equal(workspaceOf('scripts/a.js'), null);
});

test('REV-6467-2: shared changes type-check transitive reverse dependents', () => {
  const workspaces = [
    { workspace: 'packages/types', name: '@tuturuuu/types', dependencies: [] },
    {
      workspace: 'packages/utils',
      name: '@tuturuuu/utils',
      dependencies: ['@tuturuuu/types'],
    },
    {
      workspace: 'apps/web',
      name: '@tuturuuu/web',
      dependencies: ['@tuturuuu/utils'],
    },
    {
      workspace: 'apps/unrelated',
      name: '@tuturuuu/unrelated',
      dependencies: [],
    },
  ];
  const plan = planChecks(
    changed('packages/types/src/task.ts'),
    context([], { workspaces })
  );
  assert.deepEqual(
    ids(plan).filter((id) => id.startsWith('type-check:')),
    [
      'type-check:apps/web',
      'type-check:packages/types',
      'type-check:packages/utils',
    ]
  );
});

test('REV-6467-2: root/shared configuration explicitly requires CI coverage', () => {
  for (const file of [
    'tsconfig.json',
    'biome.json',
    'biome.jsonc',
    'turbo.json',
    'package.json',
    'bun.lock',
    'bunfig.toml',
    '.npmrc',
    'vitest.config.ts',
    '.oxlintrc.json',
    '.oxfmtrc.json',
    'packages/typescript-config/base.json',
  ]) {
    const plan = planChecks(changed(file), context());
    assert.ok(
      plan.skipped.some(
        ([id, reason]) =>
          id === 'shared-config' &&
          reason.includes('not covered; CI only') &&
          reason.includes(file)
      ),
      file
    );
  }
});

test('REV-6467-4: option-like repository/workspace-relative paths cannot reach file tools', () => {
  for (const file of ['-a.ts', './-a.ts', 'packages/utils/-a.test.ts']) {
    assert.throws(() => planChecks(changed(file), context()), /[Oo]ption-like/);
  }
});

test('REV-6467-6: Git app dash route directories remain valid tool arguments', () => {
  const file = 'apps/git/src/app/[locale]/-/[wsId]/page.tsx';
  const plan = planChecks(changed(file), context([file]));
  assert.ok(plan.steps.some((step) => step.id === 'type-check:apps/git'));
  assert.ok(plan.steps.find((step) => step.id === 'biome').args.includes(file));
});
