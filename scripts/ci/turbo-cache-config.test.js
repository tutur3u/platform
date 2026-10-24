// Pins the Turbo hash invariants that keep cache hits frequent without ever
// replaying a stale pass. See apps/docs/build/devops/caching.mdx.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function listWorkspaceDirs() {
  return ['apps', 'packages'].flatMap((root) =>
    fs
      .readdirSync(path.join(repoRoot, root), { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          fs.existsSync(path.join(repoRoot, root, entry.name, 'package.json'))
      )
      .map((entry) => `${root}/${entry.name}`)
  );
}

const turbo = readJson('turbo.json');
const tasks = turbo.tasks;

// Values that change on every run, commit or machine. Hashing them makes a
// task miss on every invocation (per-run) or on every other machine (paths).
const volatileEnv = [
  /^GITHUB_/u,
  /^RUNNER_/u,
  /^CI_/u,
  /(?:^|_)SHA$/u,
  /RUN_(?:ID|ATTEMPT|NUMBER)$/u,
  /BUILT_AT$/u,
  /TIMESTAMP/u,
  /^(?:HOME|PATH|PWD|TMPDIR|TMP|TEMP|USER|LOCALAPPDATA|APPDATA|USERPROFILE|PUB_CACHE)$/u,
];
// Deployable build identity is embedded in the emitted app, so build hashes
// must change with it. Nothing else may hash per-run identity.
const deployIdentityTasks = new Set(['build', 'build:docker']);
const deployIdentityEnv = /^PLATFORM_BUILD_/u;

const remoteCacheCredentials = [
  'TURBO_API',
  'TURBO_REMOTE_CACHE_SIGNATURE_KEY',
  'TURBO_TEAM',
  'TURBO_TOKEN',
];

// Tasks that must stay uncached: persistent servers, watchers and runtime
// browser/E2E suites whose results depend on live services.
const uncachedTasks = new Set([
  '//#test:apps-native-browser',
  '@tuturuuu/hive#serve:hive',
  '@tuturuuu/hive-realtime#serve:hive-realtime',
  '@tuturuuu/types#dev',
  'dev',
  'test:e2e',
  'test:watch',
]);

// Graph-only tasks run no command and therefore store nothing.
const graphOnlyTasks = new Set(['transit']);

test('root package has no runtime workspace dependencies (global hash)', () => {
  // Turbo folds the root package's workspace dependency closure into
  // hashOfInternalDependencies. A root dependency on email-service invalidated
  // every task on 11 of 40 main commits (any utils/types/internal-api edit).
  const rootPackage = readJson('package.json');
  for (const field of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    const workspaceDeps = Object.entries(rootPackage[field] ?? {}).filter(
      ([, version]) => String(version).startsWith('workspace:')
    );
    assert.deepEqual(
      workspaceDeps,
      [],
      `root ${field} must not use workspaces`
    );
  }
  const devWorkspaceDeps = Object.entries(rootPackage.devDependencies ?? {})
    .filter(([, version]) => String(version).startsWith('workspace:'))
    .map(([name]) => name);
  // The shared tsconfig legitimately affects every type-check.
  assert.deepEqual(devWorkspaceDeps, ['@tuturuuu/typescript-config']);
});

test('the Docker watcher loads email-service without a root dependency', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'scripts/watch-blue-green/incident-email.js'),
    'utf8'
  );
  assert.doesNotMatch(source, /import\(\s*['"]@tuturuuu\/email-service['"]/u);
  assert.match(
    source,
    /'packages',\s*'email-service',\s*'src',\s*'index\.ts'/u
  );
  assert.ok(
    fs.existsSync(path.join(repoRoot, 'packages/email-service/src/index.ts'))
  );
});

test('hashed env never includes per-run, per-machine or credential values', () => {
  const hashedLists = [['globalEnv', turbo.globalEnv ?? []]];
  for (const [name, task] of Object.entries(tasks)) {
    // Uncached tasks never store or replay results, so their env is not a key.
    if (task.cache === false) continue;
    hashedLists.push([`${name}.env`, task.env ?? []]);
  }

  for (const [label, names] of hashedLists) {
    const taskName = label.replace(/\.env$/u, '');
    for (const name of names) {
      assert.ok(
        !remoteCacheCredentials.includes(name),
        `${label} hashes remote cache credential ${name}`
      );
      if (deployIdentityEnv.test(name)) {
        assert.ok(
          deployIdentityTasks.has(taskName),
          `${label} hashes deploy identity ${name}; only deploy builds may`
        );
        continue;
      }
      for (const pattern of volatileEnv) {
        assert.doesNotMatch(name, pattern, `${label} hashes volatile ${name}`);
      }
    }
  }

  for (const name of remoteCacheCredentials) {
    assert.ok(!(turbo.globalPassThroughEnv ?? []).includes(name));
  }
  // Machine paths stay available to tasks without entering the hash.
  for (const name of ['LOCALAPPDATA', 'PUB_CACHE', 'USERPROFILE']) {
    assert.ok(turbo.globalPassThroughEnv.includes(name), name);
  }
});

test('only allowlisted tasks disable caching, and every cached task stores outputs', () => {
  for (const [name, task] of Object.entries(tasks)) {
    if (task.cache === false) {
      assert.ok(uncachedTasks.has(name), `${name} disables caching`);
      continue;
    }
    assert.notEqual(task.persistent, true, `${name} is persistent but cached`);
    if (graphOnlyTasks.has(name)) continue;
    assert.ok(
      Array.isArray(task.outputs),
      `${name} must declare outputs (use [] for check-only tasks)`
    );
  }

  for (const name of ['build', 'build:docker', 'test', 'type-check']) {
    assert.notEqual(tasks[name].cache, false, `${name} must stay cacheable`);
  }
  assert.ok(tasks.build.outputs.includes('!.next/cache/**'));
  assert.ok(tasks.test.outputs.includes('coverage/**'));
  assert.ok(tasks['type-check'].outputs.includes('*.tsbuildinfo'));
});

test('narrowed inputs keep the default file set so source edits always miss', () => {
  // Root-only check tasks list their exact repository-relative inputs.
  const explicitRootInputs = new Set(['i18n:check', 'i18n:sort:check']);
  for (const [name, task] of Object.entries(tasks)) {
    if (!task.inputs || explicitRootInputs.has(name)) continue;
    assert.ok(
      task.inputs.includes('$TURBO_DEFAULT$'),
      `${name} inputs drop $TURBO_DEFAULT$`
    );
  }
});

test('upstream source edits invalidate dependents', () => {
  // Removing these links (or excluding upstream __tests__ from them) can replay
  // a stale pass: apps/web tests import packages/sso/src/__tests__ fixtures.
  assert.deepEqual(tasks['type-check'].dependsOn, ['^build', '^type-check']);
  assert.deepEqual(tasks.build.dependsOn, ['^build']);
  assert.deepEqual(tasks.test.dependsOn, ['transit']);
  assert.deepEqual(tasks.transit.dependsOn, ['^transit']);
  assert.equal(tasks.transit.inputs, undefined);
});

test('gitignored env files that change results are hashed', () => {
  // Vitest configs call loadEnv(process.cwd()), which reads gitignored .env*
  // files that $TURBO_DEFAULT$ skips.
  const loadsEnvFiles = listWorkspaceDirs().filter((dir) =>
    fs
      .readdirSync(path.join(repoRoot, dir))
      .filter((file) => /^vitest\.config\.[cm]?[jt]s$/u.test(file))
      .some((file) =>
        /\bloadEnv\(/u.test(
          fs.readFileSync(path.join(repoRoot, dir, file), 'utf8')
        )
      )
  );
  assert.ok(loadsEnvFiles.length > 0);
  assert.ok(tasks.test.inputs.includes('.env*'));
  assert.ok(tasks.build.inputs.includes('.env*'));

  // `wrangler types` and `cf workers types` derive the Env interface from
  // .dev.vars/.env files, and a cache hit must restore the declarations the
  // tsconfig reads, or a fresh checkout type-checks against missing types.
  const generators = [
    { command: /\bwrangler types\b/u, output: 'worker-configuration.d.ts' },
    { command: /\bcf workers types\b/u, output: '.cloudflare/types/**' },
  ];
  const generatedDeclaration = (file) =>
    file === 'worker-configuration.d.ts' || file.startsWith('.cloudflare/');
  const covers = (output, file) =>
    output.endsWith('/**')
      ? file.startsWith(output.slice(0, -2))
      : output === file;
  let workers = 0;
  for (const dir of listWorkspaceDirs()) {
    const manifest = readJson(`${dir}/package.json`);
    const typeCheck = Object.entries(manifest.scripts ?? {})
      .filter(([script]) => script.startsWith('type-check'))
      .map(([, command]) => command)
      .join('\n');
    const generator = generators.find(({ command }) => command.test(typeCheck));
    if (!generator) continue;
    workers += 1;

    const configPath = `${dir}/turbo.json`;
    assert.ok(fs.existsSync(path.join(repoRoot, configPath)), configPath);
    const inputs = readJson(configPath).tasks?.['type-check']?.inputs ?? [];
    for (const glob of ['$TURBO_EXTENDS$', '.dev.vars*', '.env*']) {
      assert.ok(
        inputs.includes(glob),
        `${configPath} type-check lacks ${glob}`
      );
    }
    // Restore the generated declarations on a cache hit for editors and tsc.
    const outputs = readJson(configPath).tasks['type-check'].outputs ?? [];
    assert.ok(
      outputs.includes(generator.output),
      `${configPath} type-check must restore ${generator.output}`
    );
    const tsconfigPath = `${dir}/tsconfig.json`;
    if (!fs.existsSync(path.join(repoRoot, tsconfigPath))) continue;
    for (const file of (readJson(tsconfigPath).include ?? []).filter(
      generatedDeclaration
    ))
      assert.ok(
        outputs.some((output) => covers(output, file)),
        `${configPath} type-check outputs do not restore ${file}`
      );
  }
  assert.ok(workers >= 3, 'expected the Cloudflare Worker type-check apps');
});

test('package Turbo configs extend the root and only widen inputs', () => {
  for (const dir of listWorkspaceDirs()) {
    const configPath = `${dir}/turbo.json`;
    if (!fs.existsSync(path.join(repoRoot, configPath))) continue;
    const config = readJson(configPath);
    assert.deepEqual(config.extends, ['//'], configPath);
    for (const [name, task] of Object.entries(config.tasks ?? {})) {
      if (task.inputs) {
        assert.ok(
          task.inputs.includes('$TURBO_EXTENDS$'),
          `${configPath} ${name} replaces inherited inputs`
        );
      }
      assert.notEqual(
        task.cache,
        false,
        `${configPath} ${name} disables cache`
      );
      assert.equal(
        task.dependsOn,
        undefined,
        `${configPath} ${name} overrides upstream invalidation links`
      );
      for (const variable of task.env ?? []) {
        assert.ok(!remoteCacheCredentials.includes(variable), configPath);
        for (const pattern of volatileEnv) {
          assert.doesNotMatch(variable, pattern, `${configPath} ${variable}`);
        }
      }
      if (task.outputs && !task.outputs.includes('$TURBO_EXTENDS$')) {
        for (const output of tasks[name]?.outputs ?? []) {
          assert.ok(
            task.outputs.includes(output),
            `${configPath} ${name} drops inherited output ${output}`
          );
        }
      }
    }
  }
});

test('local cache stays bounded without changing task hashes', () => {
  assert.equal(turbo.cacheMaxAge, '7d');
  assert.equal(turbo.cacheMaxSize, '4GB');
  assert.equal(turbo.globalDependencies, undefined);
});
