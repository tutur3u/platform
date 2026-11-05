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
const sourceExpression = `\${{ github.event.pull_request.head.sha || github.sha }}`;
const buildName = 'Build native Start SSR with the official Void SDK';
const typeName = 'Type-check native app without a build';
const presenceName = 'Record Apps route tree presence before frontend build';
const captureName = 'Capture generated Apps route tree evidence';
const browserActors = [
  [
    'validate',
    'Exercise actual catalogue anchors on the same emitted artifact',
  ],
  [
    'restore-acceptance',
    'Repeat ordinary anchor acceptance on restored workerd output',
  ],
];
const uploadActors = [
  ['Retain generated Apps route tree evidence', 'warn'],
  ['Retain apps diagnostic config receipt', 'error'],
  [`artifact:apps-native-\${{ env.APPS_SOURCE_SHA }}`, 'error'],
];

function job(source, name) {
  const lines = source.split('\n');
  const starts = lines.flatMap((line, index) =>
    line === `  ${name}:` ? [index] : []
  );
  assert.equal(starts.length, 1, `${name}.job must be unique`);
  const start = starts[0];
  const next = lines.findIndex(
    (line, index) => index > start && /^ {2}[A-Za-z0-9_-]+:$/u.test(line)
  );
  return lines.slice(start, next === -1 ? lines.length : next).join('\n');
}

function actor(source, owner, name) {
  const body = job(source, owner);
  if (name === 'env') {
    const matches = body.match(/^ {4}env:\n(?:^ {6}.+\n)+/gmu);
    assert.equal(matches?.length, 1, `${owner}.env must be unique`);
    return matches[0];
  }
  const blocks = body.split(/(?=^ {6}- (?:name:|uses:))/mu).slice(1);
  const matches = blocks.filter((block) => {
    if (name === 'checkout') {
      return block.startsWith('      - uses: actions/checkout@');
    }
    if (name.startsWith('artifact:')) {
      return (
        block.startsWith('      - uses: actions/upload-artifact@') &&
        block.split('\n').includes(`          name: ${name.slice(9)}`)
      );
    }
    return block.startsWith(`      - name: ${name}\n`);
  });
  assert.equal(matches.length, 1, `${owner}/${name}.step must be unique`);
  return matches[0];
}

function diagnostic(rule) {
  const [owner, name, field] = rule;
  return `${owner}/${name}.${field}`;
}

function fieldLine(rule) {
  const [, , field, indent, value] = rule;
  return `${' '.repeat(indent)}${field}: ${value}`;
}

const wrapperActors = [
  ['validate', buildName, 'cd apps/apps && bun run build:cloudflare'],
  ['validate', typeName, 'cd apps/apps && bun run type-check'],
  ...browserActors.map(([owner, name]) => [owner, name, browserCommand]),
];
const fieldRules = [];
for (const [owner, name, command] of wrapperActors) {
  fieldRules.push(
    [owner, name, 'uses', 8, wrapper],
    [owner, name, 'command', 10, command],
    [owner, name, 'token', 10, "''"],
    [owner, name, 'team', 10, "''"]
  );
}
fieldRules.push(['validate', buildName, 'id', 8, 'apps-frontend-build']);
for (const [owner, name] of browserActors) {
  fieldRules.push(
    [owner, name, 'timeout-minutes', 8, '5'],
    [owner, name, 'CI', 10, "'true'"],
    [
      owner,
      name,
      'APPS_ARTIFACT_RECEIPT',
      10,
      `\${{ runner.temp }}/apps-native-artifact.json`,
    ]
  );
}
for (const owner of ['validate', 'restore-acceptance']) {
  fieldRules.push(
    [owner, 'env', 'APPS_SOURCE_SHA', 6, sourceExpression],
    [owner, 'checkout', 'ref', 10, `\${{ env.APPS_SOURCE_SHA }}`],
    [owner, 'checkout', 'persist-credentials', 10, 'false']
  );
}
fieldRules.push(
  ['validate', captureName, 'if', 8, 'always()'],
  [
    'validate',
    captureName,
    'APPS_FRONTEND_BUILD_OUTCOME',
    10,
    `\${{ steps.apps-frontend-build.outcome || 'unknown' }}`,
  ]
);
for (const [name, policy] of uploadActors) {
  fieldRules.push(
    ['validate', name, 'retention-days', 10, '7'],
    ['validate', name, 'if-no-files-found', 10, policy]
  );
  if (!name.startsWith('artifact:')) {
    fieldRules.push(['validate', name, 'if', 8, 'always()']);
  }
}

const fragmentRules = [
  ...[presenceName, captureName].map((name) => [
    'validate',
    name,
    'route_tree',
    '          route_tree=apps/apps/src/routeTree.gen.ts',
  ]),
  [
    'validate',
    'Recheck output and pack only qualified bytes',
    'receipt-verification',
    'python3 scripts/ci/apps-native-artifact.py verify apps/apps --receipt "$RUNNER_TEMP/apps-native-artifact.json"',
  ],
  [
    'restore-acceptance',
    'Confirm qualification did not mutate the restored artifact',
    'receipt-verification',
    'python3 scripts/ci/apps-native-artifact.py verify apps/apps --receipt "$RUNNER_TEMP/apps-native-artifact.json"',
  ],
];

function assertWorkflow(source) {
  for (const rule of fieldRules) {
    const [owner, name, field, indent] = rule;
    const prefix = `${' '.repeat(indent)}${field}:`;
    assert.deepEqual(
      actor(source, owner, name)
        .split('\n')
        .filter((line) => line.startsWith(prefix)),
      [fieldLine(rule)],
      `${diagnostic(rule)} must retain its exact field policy`
    );
  }
  for (const [owner, name] of wrapperActors) {
    for (const field of ['run', 'working-directory']) {
      assert.doesNotMatch(
        actor(source, owner, name),
        new RegExp(`^ {8}${field}:`, 'mu'),
        `${owner}/${name}.${field} must remain absent`
      );
    }
  }
  for (const rule of fragmentRules) {
    const [owner, name, , fragment] = rule;
    assert.equal(
      actor(source, owner, name).split(fragment).length - 1,
      1,
      `${diagnostic(rule)} must retain its owning source literal`
    );
  }
  const before = actor(source, 'validate', presenceName);
  const build = actor(source, 'validate', buildName);
  const capture = actor(source, 'validate', captureName);
  assert.ok(
    source.indexOf(before) < source.indexOf(build),
    `validate/${presenceName}.order must precede build`
  );
  assert.ok(
    source.indexOf(build) < source.indexOf(capture),
    `validate/${captureName}.order must follow build`
  );
  assert.equal(
    source.match(
      /command: bun turbo:local run test:apps-native-browser --concurrency=1/gu
    )?.length,
    2,
    'workflow.browser-command-count must remain two'
  );
  assert.doesNotMatch(
    source,
    /^ {8}run: node --test scripts\/ci\/apps-native-browser\.runtime\.mjs$/mu,
    'workflow.runtime-bypass must remain absent'
  );
  let credentialFreeSource = source;
  for (const id of ['native-publish-staging']) {
    const publisher = job(source, id);
    let admittedPublisher = publisher;
    for (const name of [
      'STAGING_SUPABASE_URL',
      'STAGING_SUPABASE_PUBLISHABLE_KEY',
      'CLOUDFLARE_STAGING_API_TOKEN',
      'WAVE1_CONTROL_READ_TOKEN',
    ]) {
      const expression = `\${{ github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch') && secrets.${name} || '' }}`;
      const field = `      ${name}: ${expression}`;
      assert.equal(
        publisher.split(field).length - 1,
        1,
        'workflow.secrets exact staging field'
      );
      admittedPublisher = admittedPublisher.replace(field, '');
    }
    credentialFreeSource = credentialFreeSource.replace(
      publisher,
      admittedPublisher
    );
  }
  assert.doesNotMatch(
    credentialFreeSource,
    /secrets(?:\.|\[)/u,
    'workflow.secrets must remain absent outside explicit staging input admission'
  );
}

function replaceActor(source, owner, name, before, after) {
  const original = actor(source, owner, name);
  assert.equal(original.split(before).length - 1, 1, 'Unique intended literal');
  const scope = job(source, owner);
  assert.equal(
    scope.split(original).length - 1,
    1,
    'Unique actor in owning scope'
  );
  assert.equal(source.split(scope).length - 1, 1, 'Unique owning scope');
  const updated = original.replace(before, after);
  assert.notEqual(updated, original, 'Intended actor must change');
  const offset = source.indexOf(scope) + scope.indexOf(original);
  const changed =
    source.slice(0, offset) + updated + source.slice(offset + original.length);
  assert.equal(actor(changed, owner, name), updated, 'Selected actor changed');
  assert.equal(
    changed.slice(0, offset) +
      original +
      changed.slice(offset + updated.length),
    source,
    'Only the intended actor changed'
  );
  return changed;
}

function rejectsActor(rule, before, after) {
  const changed = replaceActor(workflow, rule[0], rule[1], before, after);
  const expected = `${diagnostic(rule)} `;
  assert.throws(
    () => assertWorkflow(changed),
    (error) =>
      error instanceof assert.AssertionError &&
      error.message.startsWith(expected),
    expected
  );
}

function ruleFor(owner, name, field) {
  const matches = fieldRules.filter(
    (rule) => rule[0] === owner && rule[1] === name && rule[2] === field
  );
  assert.equal(matches.length, 1, 'Mutation must own one field rule');
  return matches[0];
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
    'node --test scripts/ci/apps-native-browser.runtime.mjs',
    'package.scripts.test:apps-native-browser must retain the root command'
  );
  const task = config.tasks[taskName];
  assert.ok(task, 'turbo.task must exist');
  for (const [field, expected] of [
    ['cache', false],
    ['env', ['APPS_SOURCE_SHA', 'CI']],
    ['passThroughEnv', ['APPS_ARTIFACT_RECEIPT']],
  ]) {
    assert.deepEqual(
      task[field],
      expected,
      `turbo.task.${field} must be exact`
    );
  }
  assert.deepEqual(
    Object.keys(task).sort(),
    ['cache', 'env', 'passThroughEnv'],
    'turbo.task.keys must exclude build dependencies and extra policy'
  );
  for (const key of ['globalEnv', 'globalPassThroughEnv']) {
    for (const name of ['APPS_SOURCE_SHA', 'APPS_ARTIFACT_RECEIPT', 'CI']) {
      assert.ok(
        !(config[key] ?? []).some((pattern) => matchesEnv(pattern, name)),
        `turbo.${key}.${name} must be task-owned`
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

test('every workflow field rejects drift at its unique owning actor', () => {
  for (const rule of fieldRules) {
    rejectsActor(
      rule,
      fieldLine(rule),
      fieldLine(rule).replace(/: .*$/u, ': drift')
    );
  }
});

test('workflow contract rejects build bypass, cwd drift and lost failure evidence', () => {
  const changes = [
    [
      buildName,
      'command',
      'cd apps/apps && bun run build:cloudflare',
      'bun run build:cloudflare',
    ],
    [buildName, 'uses', `uses: ${wrapper}`, 'run: bun run build:cloudflare'],
    [buildName, 'id', 'id: apps-frontend-build', 'id: renamed-build'],
    [buildName, 'token', "token: ''", 'token: unauthorized-token'],
    [buildName, 'team', "team: ''", 'team: unauthorized-team'],
    [captureName, 'if', 'if: always()', 'if: success()'],
    [
      captureName,
      'APPS_FRONTEND_BUILD_OUTCOME',
      "steps.apps-frontend-build.outcome || 'unknown'",
      "steps.renamed-build.outcome || 'unknown'",
    ],
    [
      'Retain apps diagnostic config receipt',
      'if-no-files-found',
      'if-no-files-found: error',
      'if-no-files-found: ignore',
    ],
    [
      'checkout',
      'persist-credentials',
      'persist-credentials: false',
      'persist-credentials: true',
    ],
  ];
  for (const [name, field, before, after] of changes) {
    rejectsActor(ruleFor('validate', name, field), before, after);
  }
  const rule = fragmentRules[0];
  rejectsActor(rule, rule[3], rule[3].replace('apps/apps/src', 'other'));
});

test('each job owns its pull-request head source pin', () => {
  for (const owner of ['validate', 'restore-acceptance']) {
    const rule = ruleFor(owner, 'env', 'APPS_SOURCE_SHA');
    rejectsActor(
      rule,
      fieldLine(rule),
      fieldLine(rule).replace(sourceExpression, `\${{ github.sha }}`)
    );
  }
});

test('owning type-check rejects wrapper, cwd and public cache fence drift', () => {
  for (const [field, before, after] of [
    ['uses', `uses: ${wrapper}`, 'run: bun run type-check'],
    [
      'command',
      'command: cd apps/apps && bun run type-check',
      'command: bun run type-check',
    ],
    ['token', "token: ''", 'token: unauthorized-token'],
    ['team', "team: ''", 'team: unauthorized-team'],
  ]) {
    rejectsActor(ruleFor('validate', typeName, field), before, after);
  }
});

test('both route tree evidence steps reject a different source path', () => {
  for (const rule of fragmentRules.slice(0, 2)) {
    rejectsActor(rule, rule[3], rule[3].replace('apps/apps/src', 'other'));
  }
});

test('each artifact receipt verification remains at its owning step', () => {
  for (const rule of fragmentRules.slice(2)) {
    rejectsActor(rule, rule[3], rule[3].replace('apps/apps', 'other'));
  }
});

test('each browser job rejects runtime bypasses, token leakage and receipt drift', () => {
  for (const [owner, name] of browserActors) {
    for (const [field, before, after] of [
      [
        'uses',
        `uses: ${wrapper}`,
        'run: node --test scripts/ci/apps-native-browser.runtime.mjs',
      ],
      [
        'command',
        browserCommand,
        'node --test scripts/ci/apps-native-browser.runtime.mjs',
      ],
      ['token', "token: ''", 'token: unauthorized-token'],
      ['team', "team: ''", 'team: unauthorized-team'],
      ['timeout-minutes', 'timeout-minutes: 5', 'timeout-minutes: 10'],
      ['CI', "CI: 'true'", "CI: 'false'"],
      ['APPS_ARTIFACT_RECEIPT', 'APPS_ARTIFACT_RECEIPT:', 'OTHER_RECEIPT:'],
    ]) {
      rejectsActor(ruleFor(owner, name, field), before, after);
    }
  }
});

test('wrapper actors reject competing execution fields without hiding behind another actor', () => {
  for (const [owner, name] of wrapperActors) {
    for (const field of ['run', 'working-directory']) {
      const before = `        uses: ${wrapper}\n`;
      rejectsActor(
        [owner, name, field],
        before,
        `${before}        ${field}: unauthorized\n`
      );
    }
  }
});

function mutateProperty(original, path, value) {
  const changed = structuredClone(original);
  let parent = changed;
  for (const key of path.slice(0, -1)) parent = parent[key];
  const key = path.at(-1);
  const present = Object.hasOwn(parent, key);
  const before = parent[key];
  if (value === undefined) delete parent[key];
  else parent[key] = value;
  assert.notDeepEqual(changed, original, 'Intended property must change');
  const restored = structuredClone(changed);
  let restoredParent = restored;
  for (const part of path.slice(0, -1)) restoredParent = restoredParent[part];
  if (present) restoredParent[key] = before;
  else delete restoredParent[key];
  assert.deepEqual(restored, original, 'Only the intended property changed');
  return changed;
}

test('metadata contract rejects caching, incorrect hashing and global allowances', () => {
  const changes = [
    [['tasks', taskName, 'cache'], true, 'turbo.task.cache'],
    [['tasks', taskName], undefined, 'turbo.task must exist'],
    [['tasks', taskName, 'env'], ['CI'], 'turbo.task.env'],
    [
      ['tasks', taskName, 'env'],
      ['APPS_SOURCE_SHA', 'CI', 'APPS_ARTIFACT_RECEIPT'],
      'turbo.task.env',
    ],
    [
      ['tasks', taskName, 'passThroughEnv'],
      ['APPS_ARTIFACT_RECEIPT', 'APPS_SOURCE_SHA'],
      'turbo.task.passThroughEnv',
    ],
    [['tasks', taskName, 'passThroughEnv'], [], 'turbo.task.passThroughEnv'],
    [['tasks', taskName, 'dependsOn'], ['build'], 'turbo.task.keys'],
  ];
  for (const key of ['globalEnv', 'globalPassThroughEnv']) {
    for (const pattern of [
      'APPS_SOURCE_SHA',
      'APPS_ARTIFACT_RECEIPT',
      'APPS_*',
      '*',
      'CI',
    ]) {
      const name =
        pattern === 'CI'
          ? 'CI'
          : pattern === 'APPS_ARTIFACT_RECEIPT'
            ? pattern
            : 'APPS_SOURCE_SHA';
      changes.push([
        [key],
        [...(turbo[key] ?? []), pattern],
        `turbo.${key}.${name}`,
      ]);
    }
  }
  for (const [path, value, expected] of changes) {
    const config = mutateProperty(turbo, path, value);
    assert.throws(
      () => assertMetadata(packageJson, config),
      (error) =>
        error instanceof assert.AssertionError &&
        error.message.startsWith(expected)
    );
  }
  const pkg = mutateProperty(
    packageJson,
    ['scripts', 'test:apps-native-browser'],
    'node --test apps/apps/cloudflare/native-built-worker.test.mjs'
  );
  assert.throws(
    () => assertMetadata(pkg, turbo),
    (error) =>
      error instanceof assert.AssertionError &&
      error.message.startsWith('package.scripts.test:apps-native-browser ')
  );
});

test('staging input exception rejects production refs and production secret substitutions', () => {
  for (const changed of [
    workflow.replaceAll(
      "github.ref == 'refs/heads/main'",
      "github.ref == 'refs/heads/production'"
    ),
    workflow.replaceAll(
      'secrets.STAGING_SUPABASE_',
      'secrets.PRODUCTION_SUPABASE_'
    ),
  ])
    assert.throws(() => assertWorkflow(changed), /workflow.secrets/);
});

test('staging deploy/control secrets are allowed only in the explicit publisher call', () => {
  for (const name of [
    'CLOUDFLARE_STAGING_API_TOKEN',
    'WAVE1_CONTROL_READ_TOKEN',
  ]) {
    const expression = `\${{ github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch') && secrets.${name} || '' }}`;
    const leak = workflow.replace("token: ''", `token: ${expression}`);
    assert.notEqual(leak, workflow);
    assert.throws(() => assertWorkflow(leak), /token|workflow.secrets/);
    const production = workflow.replace(
      `secrets.${name}`,
      'secrets.CLOUDFLARE_API_TOKEN'
    );
    assert.throws(() => assertWorkflow(production), /workflow.secrets/);
  }
});

test('native qualification rejects forwarding every publisher secret', () => {
  const qualification = job(workflow, 'native-publication-profiles');
  for (const name of [
    'CLOUDFLARE_STAGING_API_TOKEN',
    'WAVE1_CONTROL_READ_TOKEN',
    'STAGING_SUPABASE_URL',
    'STAGING_SUPABASE_PUBLISHABLE_KEY',
  ]) {
    const expression = `\${{ github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch') && secrets.${name} || '' }}`;
    const changed = workflow.replace(
      qualification,
      `${qualification}\n    secrets:\n      ${name}: ${expression}\n`
    );
    assert.throws(() => assertWorkflow(changed), /workflow.secrets/);
  }
});

test('staging Supabase expressions are rejected in another job', () => {
  for (const name of ['URL', 'PUBLISHABLE_KEY']) {
    const expression = `\${{ github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch') && secrets.STAGING_SUPABASE_${name} || '' }}`;
    const changed = `${workflow}\n  leaked-input:\n    env:\n      INPUT: ${expression}\n`;
    assert.throws(() => assertWorkflow(changed), /workflow.secrets/);
  }
});
