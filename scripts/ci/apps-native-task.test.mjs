import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const workflow = read('.github/workflows/apps-cloudflare.yaml');
const packageJson = JSON.parse(read('package.json'));
const turbo = JSON.parse(read('turbo.json'));
const taskName = '//#test:apps-native-browser';
const wrapper = './.github/actions/run-with-turbo-remote-cache';
const browserCommand =
  'bun turbo:local run test:apps-native-browser --concurrency=1';
const browserNames = [
  'Exercise actual catalogue anchors on the same emitted artifact',
  'Repeat ordinary anchor acceptance on restored workerd output',
];

function step(source, name) {
  const matches = source
    .split(/(?=^ {6}- (?:name:|uses:))/mu)
    .filter((block) => block.startsWith(`      - name: ${name}\n`));
  assert.equal(matches.length, 1, `Require exactly one ${name} step`);
  return matches[0];
}

function assertWrapper(block, command) {
  assert.ok(block.includes(`        uses: ${wrapper}\n`));
  assert.doesNotMatch(block, /^ {8}(?:run|working-directory):/mu);
  assert.ok(block.includes(`          command: ${command}\n`));
  assert.match(block, /^ {10}token: ''$/mu);
  assert.match(block, /^ {10}team: ''$/mu);
}

function assertWorkflow(source) {
  const build = step(
    source,
    'Build native Start SSR with the official Void SDK'
  );
  assert.match(build, /^ {8}id: apps-frontend-build$/mu);
  assertWrapper(build, 'cd apps/apps && bun run build:cloudflare');
  for (const name of browserNames) {
    const browser = step(source, name);
    assertWrapper(browser, browserCommand);
    assert.match(browser, /^ {8}timeout-minutes: 5$/mu);
    assert.match(browser, /^ {10}CI: 'true'$/mu);
    assert.match(
      browser,
      /^ {10}APPS_ARTIFACT_RECEIPT: \$\{\{ runner\.temp \}\}\/apps-native-artifact\.json$/mu
    );
  }
  assert.equal(
    source.match(
      /command: bun turbo:local run test:apps-native-browser --concurrency=1/gu
    )?.length,
    2
  );
  assert.doesNotMatch(
    source,
    /^ {8}run: node --test scripts\/ci\/apps-native-browser\.runtime\.mjs$/mu
  );
  assert.equal(
    source.match(
      /APPS_SOURCE_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/gu
    )?.length,
    2
  );
  assertWrapper(
    step(source, 'Type-check native app without a build'),
    'cd apps/apps && bun run type-check'
  );
  const before = step(
    source,
    'Record Apps route tree presence before frontend build'
  );
  const capture = step(source, 'Capture generated Apps route tree evidence');
  for (const block of [before, capture]) {
    assert.match(
      block,
      /^ {10}route_tree=apps\/apps\/src\/routeTree\.gen\.ts$/mu,
      'Route tree evidence must pin the owning Apps source path'
    );
  }
  assert.ok(source.indexOf(before) < source.indexOf(build));
  assert.match(capture, /^ {8}if: always\(\)$/mu);
  assert.match(
    capture,
    /^ {10}APPS_FRONTEND_BUILD_OUTCOME: \$\{\{ steps\.apps-frontend-build\.outcome \|\| 'unknown' \}\}$/mu
  );
  assert.ok(source.indexOf(build) < source.indexOf(capture));
  assert.ok(
    source.includes(
      'python3 scripts/ci/apps-native-artifact.py verify apps/apps --receipt "$RUNNER_TEMP/apps-native-artifact.json"'
    )
  );
  assert.ok(source.includes('if-no-files-found: error'));
  assert.equal(source.match(/persist-credentials: false/gu)?.length, 2);
  assert.doesNotMatch(source, /secrets\./u);
}

function matchesEnv(pattern, name) {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/gu, '\\$&')
    .replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`, 'u').test(name);
}

function assertMetadata(pkg, config) {
  assert.equal(
    pkg.scripts['test:apps-native-browser'],
    'node --test scripts/ci/apps-native-browser.runtime.mjs'
  );
  assert.deepEqual(config.tasks[taskName], {
    cache: false,
    env: ['APPS_SOURCE_SHA', 'CI'],
    passThroughEnv: ['APPS_ARTIFACT_RECEIPT'],
  });
  for (const key of ['globalEnv', 'globalPassThroughEnv']) {
    for (const name of ['APPS_SOURCE_SHA', 'APPS_ARTIFACT_RECEIPT', 'CI']) {
      assert.ok(
        !(config[key] ?? []).some((pattern) => matchesEnv(pattern, name)),
        `${name} must be task-owned`
      );
    }
  }
}

test('native build and both browser jobs use fenced public cache wrappers', () => {
  assertWorkflow(workflow);
});

test('browser root task hashes the source SHA and always rechecks the transported receipt', () => {
  assertMetadata(packageJson, turbo);
});

test('workflow contract rejects build bypass, cwd drift and lost failure evidence', () => {
  const changes = [
    [
      'command: cd apps/apps && bun run build:cloudflare',
      'command: bun run build:cloudflare',
    ],
    [`uses: ${wrapper}`, 'run: bun run build:cloudflare'],
    ['id: apps-frontend-build', 'id: renamed-build'],
    ["token: ''", 'token: unauthorized-token'],
    ["team: ''", 'team: unauthorized-team'],
    [
      'name: Capture generated Apps route tree evidence\n        if: always()',
      'name: Capture generated Apps route tree evidence\n        if: success()',
    ],
    [
      "steps.apps-frontend-build.outcome || 'unknown'",
      "steps.renamed-build.outcome || 'unknown'",
    ],
    [
      'route_tree=apps/apps/src/routeTree.gen.ts',
      'route_tree=other/routeTree.gen.ts',
    ],
    ['if-no-files-found: error', 'if-no-files-found: ignore'],
    ['persist-credentials: false', 'persist-credentials: true'],
    ['github.event.pull_request.head.sha || github.sha', 'github.sha'],
  ];
  for (const [before, after] of changes) {
    const build = step(
      workflow,
      'Build native Start SSR with the official Void SDK'
    );
    const changed = build.includes(before)
      ? workflow.replace(build, build.replace(before, after))
      : workflow.replace(before, after);
    assert.notEqual(changed, workflow, `Mutation must reach ${before}`);
    assert.throws(
      () => assertWorkflow(changed),
      before === 'route_tree=apps/apps/src/routeTree.gen.ts'
        ? /Route tree evidence must pin the owning Apps source path/u
        : undefined,
      before
    );
  }
});

test('owning type-check rejects wrapper, cwd and public cache fence drift', () => {
  const original = step(workflow, 'Type-check native app without a build');
  for (const [before, after] of [
    [`uses: ${wrapper}`, 'run: bun run type-check'],
    [
      'command: cd apps/apps && bun run type-check',
      'command: bun run type-check',
    ],
    ["token: ''", 'token: unauthorized-token'],
    ["team: ''", 'team: unauthorized-team'],
  ]) {
    const changed = original.replace(before, after);
    assert.notEqual(changed, original, `Mutation must reach ${before}`);
    assert.throws(() => assertWorkflow(workflow.replace(original, changed)));
  }
});

test('both route tree evidence steps reject a different source path', () => {
  for (const name of [
    'Record Apps route tree presence before frontend build',
    'Capture generated Apps route tree evidence',
  ]) {
    const original = step(workflow, name);
    const changed = original.replace(
      'route_tree=apps/apps/src/routeTree.gen.ts',
      'route_tree=other/routeTree.gen.ts'
    );
    assert.notEqual(changed, original, `Mutation must reach ${name}`);
    assert.throws(
      () => assertWorkflow(workflow.replace(original, changed)),
      /Route tree evidence must pin the owning Apps source path/u
    );
  }
});

test('each browser job rejects runtime bypasses, token leakage and receipt drift', () => {
  for (const name of browserNames) {
    const original = step(workflow, name);
    for (const [before, after] of [
      [
        `uses: ${wrapper}`,
        'run: node --test scripts/ci/apps-native-browser.runtime.mjs',
      ],
      [
        browserCommand,
        'node --test scripts/ci/apps-native-browser.runtime.mjs',
      ],
      ["token: ''", 'token: unauthorized-token'],
      ["team: ''", 'team: unauthorized-team'],
      ['timeout-minutes: 5', 'timeout-minutes: 10'],
      ["CI: 'true'", "CI: 'false'"],
      ['APPS_ARTIFACT_RECEIPT:', 'OTHER_RECEIPT:'],
    ]) {
      const changed = original.replace(before, after);
      assert.notEqual(changed, original, `Mutation must reach ${before}`);
      assert.throws(
        () => assertWorkflow(workflow.replace(original, changed)),
        undefined,
        `${name}: ${before}`
      );
    }
  }
});

test('metadata contract rejects caching, incorrect hashing and global allowances', () => {
  const changes = [
    (config) => {
      config.tasks[taskName].cache = true;
    },
    (config) => {
      delete config.tasks[taskName];
    },
    (config) => {
      config.tasks[taskName].env = ['CI'];
    },
    (config) => {
      config.tasks[taskName].env.push('APPS_ARTIFACT_RECEIPT');
    },
    (config) => {
      config.tasks[taskName].passThroughEnv.push('APPS_SOURCE_SHA');
    },
    (config) => {
      config.tasks[taskName].passThroughEnv = [];
    },
    (config) => {
      config.tasks[taskName].dependsOn = ['build'];
    },
  ];
  for (const key of ['globalEnv', 'globalPassThroughEnv']) {
    for (const pattern of [
      'APPS_SOURCE_SHA',
      'APPS_ARTIFACT_RECEIPT',
      'APPS_*',
      '*',
      'CI',
    ]) {
      changes.push((config) => {
        config[key] = [...(config[key] ?? []), pattern];
      });
    }
  }
  for (const change of changes) {
    const config = structuredClone(turbo);
    change(config);
    assert.throws(() => assertMetadata(packageJson, config));
  }
  const pkg = structuredClone(packageJson);
  pkg.scripts['test:apps-native-browser'] =
    'node --test apps/apps/cloudflare/native-built-worker.test.mjs';
  assert.throws(() => assertMetadata(pkg, turbo));
});
