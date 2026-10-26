// Map changed paths to the cheap local checks that mirror the CI gates most
// often missed before pushing. Pure functions only; the runner executes steps.

const path = require('node:path');
const { reverseDependents, assertSafePaths } = require('./workspaces.js');
const { PAUSED_APP_DIRECTORIES } = require('../paused-runtimes.js');

const BIOME_VERSION = '2.5.13';
// Keep in sync with .github/workflows/branch-name-check.yaml (tested).
const BRANCH_NAME_PATTERN =
  /^(feature|feat|fix|bugfix|hotfix|release|chore|docs|style|refactor|perf|dependabot|claude)\/.+|^release-please--branches--.+|^imgbot$/;
const BIOME_FILE = /\.(?:[cm]?[jt]sx?|jsonc?|css|graphql|gql)$/;
const SCRIPT_FILE = /\.(?:[cm]?js|ts)$/;
const TS_SOURCE = /\.(?:[cm]?tsx?|d\.ts)$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const NODE_TEST_FILE = /\.test\.(?:c?js|mjs)$/;
const MOBILE_PREFIX = 'apps/mobile/';
const OXC_EXCLUDED = new Set([
  'node_modules',
  'dist',
  '.next',
  '.open-next',
  'coverage',
  '.worktrees',
  'tmp',
]);
const WORKFLOW_POLICY_TESTS = [
  'scripts/ci/protected-workflow-concurrency.test.js',
  'scripts/ci/bun-workflow-pins.test.js',
  'scripts/ci/check-workflow-config.test.js',
];
const AUTH_GUARDS = [
  ['internal-app-auth', 'scripts/check-internal-app-auth.js'],
  ['satellite-cookie-auth', 'scripts/check-satellite-cookie-auth.js'],
  ['server-console', 'scripts/check-server-console.js'],
];

function isPausedPath(file) {
  const match = /^apps\/([^/]+)\//.exec(file);
  return Boolean(match && PAUSED_APP_DIRECTORIES.has(match[1]));
}

function workspaceOf(file) {
  const match = /^(apps|packages)\/([^/]+)\//.exec(file);
  return match ? `${match[1]}/${match[2]}` : null;
}

function isBranchNameValid(branch) {
  return BRANCH_NAME_PATTERN.test(branch);
}

function nodeStep(id, label, args, extra = {}) {
  return { id, label, command: 'node', args, ...extra };
}

// Colocated tests: `foo.ts` -> `foo.test.ts(x)`, `__tests__/foo.test.ts(x)`.
function siblingTests(file, exists) {
  if (TEST_FILE.test(file)) return exists(file) ? [file] : [];
  const extension = path.posix.extname(file);
  if (!/^\.[cm]?[jt]sx?$/.test(extension)) return [];
  const directory = path.posix.dirname(file);
  const base = path.posix.basename(file, extension);
  const candidates = [];
  for (const suffix of ['.test', '.spec']) {
    for (const ext of ['.ts', '.tsx', '.js', '.mjs']) {
      candidates.push(path.posix.join(directory, `${base}${suffix}${ext}`));
      candidates.push(
        path.posix.join(directory, '__tests__', `${base}${suffix}${ext}`)
      );
    }
  }
  return candidates.filter(exists);
}

function nodeScriptTests(files, exists) {
  const selected = new Set();
  for (const file of files) {
    if (NODE_TEST_FILE.test(file)) {
      if (exists(file)) selected.add(file);
      continue;
    }
    if (!/^(scripts|\.github\/actions|plugins)\//.test(file)) continue;
    const extension = path.posix.extname(file);
    if (!['.js', '.mjs', '.cjs', '.ts'].includes(extension)) continue;
    const stem = file.slice(0, -extension.length);
    for (const candidate of [`${stem}.test.js`, `${stem}.test.mjs`]) {
      if (exists(candidate)) selected.add(candidate);
    }
  }
  return [...selected].sort();
}

function runtimeImports(source, filename) {
  const { parse } = require('@babel/parser');
  const ast = parse(source, {
    sourceType: 'unambiguous',
    sourceFilename: filename,
    plugins: ['typescript', 'jsx'],
    createImportExpressions: true,
    allowReturnOutsideFunction: true,
  });
  const imports = new Set();
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    let specifier;
    if (
      node.type === 'ImportDeclaration' &&
      node.importKind !== 'type' &&
      (node.specifiers.length === 0 ||
        node.specifiers.some((entry) => entry.importKind !== 'type'))
    ) {
      specifier = node.source;
    } else if (
      (node.type === 'ExportNamedDeclaration' ||
        node.type === 'ExportAllDeclaration') &&
      node.exportKind !== 'type'
    ) {
      specifier = node.source;
    } else if (node.type === 'ImportExpression') {
      specifier = node.source;
    } else if (
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'require'
    ) {
      specifier = node.arguments[0];
    } else if (
      node.type === 'TSImportEqualsDeclaration' &&
      node.importKind !== 'type' &&
      node.moduleReference.type === 'TSExternalModuleReference'
    ) {
      specifier = node.moduleReference.expression;
    }
    if (specifier?.type === 'StringLiteral') imports.add(specifier.value);
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child?.type) visit(child);
    }
  }
  visit(ast);
  return imports;
}

/**
 * Which runner owns a test file: 'vitest', 'node' (node --test) or 'bun'
 * (`bun test`, for Worker/Durable Object suites that CI runs with Bun and that
 * Node cannot load because of extensionless workspace imports).
 */
function testRunnerOf(file, context) {
  const workspace = workspaceOf(file);
  if (!workspace) return NODE_TEST_FILE.test(file) ? 'node' : 'vitest';
  const script = context.workspaces?.find(
    (entry) => entry.workspace === workspace
  )?.testScript;
  const source = context.readSource?.(file) ?? '';
  const imports = runtimeImports(source, file);
  if (imports.has('vitest')) return 'vitest';
  if (imports.has('bun:test')) return 'bun';
  if (imports.has('node:test')) return 'node';
  return /\bnode\s+--test(?:\s|$)/.test(script ?? '') ? 'node' : 'vitest';
}
function isNodeTest(file, context) {
  return testRunnerOf(file, context) === 'node';
}

/**
 * Build the ordered step list. `changes` is [{ status, file }] relative to the
 * repository root; deleted files only affect path gating.
 */
function planChecks(changes, context) {
  const exists = context.exists;
  const all = changes.map((change) => change.file);
  assertSafePaths(all);
  const present = changes
    .filter((change) => change.status !== 'D')
    .map((change) => change.file)
    .filter((file) => !isPausedPath(file));
  const any = (pattern) => all.some((file) => pattern.test(file));
  const steps = [];
  const skipped = [];
  const sharedConfig = all.filter((file) =>
    /^(?:tsconfig\.json|biome\.jsonc?|turbo\.json|package\.json|bun\.lock|bunfig\.toml|\.npmrc|vitest\.config\.ts|\.oxlintrc\.json|\.oxfmtrc\.json)$|^packages\/typescript-config\/.*\.json$/.test(
      file
    )
  );
  if (sharedConfig.length)
    skipped.push([
      'shared-config',
      `not covered; CI only: root/shared configuration (${sharedConfig.join(', ')})`,
    ]);

  const branches =
    context.pushedBranches ?? (context.branch ? [context.branch] : []);
  if (branches.length) {
    steps.push({
      id: 'branch-name',
      label: `branch name ${branches.join(', ')}${context.localBranch ? ` (tracking for ${context.localBranch})` : ''}`,
      inline: () => branches.every(isBranchNameValid),
      failureHint:
        'Use a type/description branch, for example chore/<topic>; ci/ is rejected.',
    });
  } else {
    skipped.push([
      'branch-name',
      context.pushedBranches ? 'no pushed branch refs' : 'detached HEAD',
    ]);
  }

  steps.push(
    nodeStep('source-size', 'source-size (700 LOC ceiling)', [
      'scripts/check-source-size.js',
      ...(context.base ? ['--base', context.base] : []),
    ]),
    nodeStep('docs-inventory', 'generated docs inventory', [
      'scripts/generate-docs-inventory.js',
      '--check',
    ]),
    nodeStep('app-seo', 'generated app SEO assets', [
      'scripts/generate-app-seo.js',
      '--check',
    ])
  );
  if (any(/^apps\/docs\//)) {
    steps.push(
      nodeStep('docs-audit', 'docs navigation audit', ['scripts/docs-audit.js'])
    );
  }

  const biomeFiles = present.filter(
    (file) => BIOME_FILE.test(file) && !file.startsWith(MOBILE_PREFIX)
  );
  if (biomeFiles.length) {
    steps.push({
      id: 'biome',
      label: `biome check (${biomeFiles.length} files)`,
      command: context.biomeBinary ?? 'npx',
      args: [
        ...(context.biomeBinary
          ? []
          : ['--yes', `@biomejs/biome@${BIOME_VERSION}`]),
        'check',
        '--error-on-warnings',
        '--no-errors-on-unmatched',
        '--files-ignore-unknown=true',
        ...biomeFiles,
      ],
      fixHint: `npx @biomejs/biome@${BIOME_VERSION} check --write <files>`,
    });
    const oxcFiles = biomeFiles.filter(
      (file) =>
        /\.[cm]?[jt]sx?$/.test(file) &&
        !file.split('/').some((segment) => OXC_EXCLUDED.has(segment))
    );
    if (oxcFiles.length) {
      steps.push(
        nodeStep(
          'oxlint',
          `oxlint (${oxcFiles.length} files, advisory)`,
          ['scripts/oxc.js', 'lint', ...oxcFiles],
          { advisory: true }
        )
      );
    }
  }

  if (any(/^(apps|packages)\/[^/]+\/.*\.[cm]?[jt]sx?$/)) {
    for (const [id, script] of AUTH_GUARDS) {
      steps.push(nodeStep(id, id, [script]));
    }
  }
  if (any(/^apps\/[^/]+\/messages\/.*\.json$/)) {
    steps.push(
      nodeStep('i18n-sort', 'i18n sort', ['scripts/i18n-sort.js', '--check']),
      nodeStep('i18n-key-parity', 'i18n en/vi parity', [
        'scripts/i18n-key-parity.js',
      ])
    );
  }
  if (any(/^apps\/database\/supabase\/migrations\//)) {
    steps.push(
      nodeStep('migration-timestamps', 'migration timestamps', [
        'scripts/check-migration-timestamps.js',
      ])
    );
  }
  if (any(/^apps\/web\/src\/(app\/api|legacy-api-routes)\//)) {
    steps.push(
      nodeStep('api-route-wrappers', 'legacy API route wrappers', [
        'scripts/generate-web-api-route-wrappers.js',
        '--check',
      ])
    );
  }
  if (
    any(
      /^(bun\.lock$|apps\/mobile\/(lib\/core\/ui\/icons\/generated|assets\/fonts\/lucide|test\/fixtures\/lucide)\/|scripts\/(mobile-lucide\/|check-mobile-lucide-sync\.js$))/
    )
  ) {
    steps.push(
      nodeStep('mobile-lucide-sync', 'mobile Lucide icons match web', [
        'scripts/check-mobile-lucide-sync.js',
      ])
    );
  }
  if (
    any(
      /^(apps\/mobile\/(lib|test)\/|apps\/mobile\/tool\/shadcn_import_allowlist\.txt$|scripts\/(check-mobile-shadcn-imports|dart-directive-uris)\.js$)/
    )
  ) {
    steps.push(
      nodeStep('mobile-shadcn-ratchet', 'mobile shadcn import ratchet', [
        'scripts/check-mobile-shadcn-imports.js',
      ])
    );
  }
  if (any(/^(apps\/mobile\/lib|apps\/web\/src\/app\/api)\//)) {
    steps.push(
      nodeStep('mobile-api-mappings', 'mobile API mappings', [
        'scripts/check-mobile-api-mappings.js',
      ])
    );
  }

  const workflowTouched = any(/^\.github\/(workflows|actions)\//);
  const relatedTests = new Map();
  for (const file of present) {
    if (!workspaceOf(file) || file.startsWith(MOBILE_PREFIX)) continue;
    for (const related of siblingTests(file, exists)) {
      relatedTests.set(related, testRunnerOf(related, context));
    }
  }
  const scriptTests = nodeScriptTests(
    all.filter((file) => !isPausedPath(file)),
    exists
  ).filter((file) => !workspaceOf(file) || isNodeTest(file, context));
  const nodeTests = [
    ...new Set([
      ...scriptTests,
      ...[...relatedTests]
        .filter(([, runner]) => runner === 'node')
        .map(([file]) => file),
      ...(workflowTouched ? WORKFLOW_POLICY_TESTS : []),
    ]),
  ].filter(exists);
  if (nodeTests.length) {
    steps.push(
      nodeStep(
        'script-tests',
        `node --test (${nodeTests.length} files)`,
        ['--test', '--test-concurrency=2', ...nodeTests],
        { heavy: true }
      )
    );
  }

  const mobileFiles = present.filter((file) => file.startsWith(MOBILE_PREFIX));
  if (all.some((file) => file.startsWith(MOBILE_PREFIX))) {
    const cwd = 'apps/mobile';
    if (any(/^apps\/mobile\/lib\/l10n\/arb\/.*\.arb$/)) {
      steps.push({
        id: 'flutter-gen-l10n',
        label: 'flutter gen-l10n',
        command: 'flutter',
        args: ['gen-l10n'],
        cwd,
      });
    }
    const dartFiles = mobileFiles
      .filter((file) => /^apps\/mobile\/(lib|test)\/.*\.dart$/.test(file))
      .filter((file) => !/\.(g|freezed|gen)\.dart$|\/l10n\/gen\//.test(file))
      .map((file) => file.slice(cwd.length + 1));
    if (dartFiles.length) {
      steps.push({
        id: 'dart-format',
        label: `dart format (${dartFiles.length} files)`,
        command: 'dart',
        args: [
          'format',
          '--output=none',
          '--set-exit-if-changed',
          ...dartFiles,
        ],
        cwd,
      });
    }
    // Same invocation as .github/workflows/mobile.yaml; infos are fatal there.
    steps.push({
      id: 'flutter-analyze',
      label: 'flutter analyze lib test',
      command: 'flutter',
      args: ['analyze', 'lib', 'test'],
      cwd,
      heavy: true,
    });
  }

  const byWorkspace = new Map();
  for (const file of present) {
    const workspace = workspaceOf(file);
    if (!workspace || workspace === 'apps/mobile') continue;
    if (!byWorkspace.has(workspace)) byWorkspace.set(workspace, []);
    byWorkspace.get(workspace).push(file);
  }

  for (const [workspace, files] of byWorkspace) {
    const related = [
      ...new Set(files.flatMap((file) => siblingTests(file, exists))),
    ];
    const bunTests = related.filter((file) => relatedTests.get(file) === 'bun');
    if (bunTests.length) {
      // `bun test` from the repository root would run the root `test` script.
      steps.push({
        id: `bun-test:${workspace}`,
        label: `bun test ${workspace} (${bunTests.length} related files)`,
        command: 'bun',
        args: [
          'test',
          ...bunTests.map((file) => path.posix.relative(workspace, file)),
        ],
        cwd: workspace,
        heavy: true,
      });
    }
    if (!context.hasVitest(workspace)) continue;
    const tests = related.filter(
      (file) => (relatedTests.get(file) ?? 'vitest') === 'vitest'
    );
    if (!tests.length) continue;
    steps.push({
      id: `vitest:${workspace}`,
      label: `vitest ${workspace} (${tests.length} related files)`,
      command: 'bun',
      args: [
        'x',
        'vitest',
        'run',
        '--maxWorkers=2',
        ...tests.map((file) => path.posix.relative(workspace, file)),
      ],
      cwd: workspace,
      heavy: true,
    });
  }

  const typeWorkspaces = new Set();
  for (const file of all) {
    const workspace = workspaceOf(file);
    if (!workspace || workspace === 'apps/mobile' || isPausedPath(file))
      continue;
    if (
      TS_SOURCE.test(file) ||
      /\/(tsconfig[^/]*\.json|package\.json)$/.test(file)
    ) {
      typeWorkspaces.add(workspace);
    }
  }
  for (const workspace of [
    ...reverseDependents(typeWorkspaces, context.workspaces),
  ].sort()) {
    steps.push({
      id: `type-check:${workspace}`,
      label: `type-check ${workspace}`,
      typeCheck: { workspace },
      heavy: true,
    });
  }

  if (!present.some((file) => SCRIPT_FILE.test(file) || TS_SOURCE.test(file))) {
    skipped.push(['vitest/type-check', 'no TypeScript or JavaScript changes']);
  }
  return { steps, skipped };
}

module.exports = {
  BIOME_VERSION,
  BRANCH_NAME_PATTERN,
  WORKFLOW_POLICY_TESTS,
  isBranchNameValid,
  isPausedPath,
  nodeScriptTests,
  planChecks,
  siblingTests,
  workspaceOf,
};
