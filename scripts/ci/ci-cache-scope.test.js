// Keeps the 10 GB Actions cache budget for shared, default-branch entries.
// Pull-request and branch refs may restore caches but must never save
// multi-GB copies that only they can reuse: those evicted the Turbo fallback
// and Supabase image archives. See apps/docs/build/devops/caching.mdx.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const workflowsDir = path.join(repoRoot, '.github', 'workflows');
const actionsDir = path.join(repoRoot, '.github', 'actions');

// Paused Docker E2E runtime: retained source, not active CI.
const pausedSavers = new Set(['.github/workflows/e2e-tests.yaml']);

function listFiles() {
  const workflows = fs
    .readdirSync(workflowsDir)
    .filter((name) => /\.ya?ml$/u.test(name))
    .map((name) => `.github/workflows/${name}`);
  const actions = fs
    .readdirSync(actionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      ['action.yml', 'action.yaml']
        .map((file) => `.github/actions/${entry.name}/${file}`)
        .filter((file) => fs.existsSync(path.join(repoRoot, file)))
    );
  return [...workflows, ...actions];
}

function read(file) {
  return fs.readFileSync(path.join(repoRoot, file), 'utf8');
}

function steps(source) {
  const starts = [...source.matchAll(/^\s+- (?:name|uses|run|id|if):/gmu)].map(
    (match) => match.index
  );
  return starts.map((start, index) =>
    source.slice(start, starts[index + 1] ?? source.length)
  );
}

const trustedGate =
  /github\.event_name != 'pull_request'[\s\S]*github\.actor != 'dependabot\[bot\]'[\s\S]*github\.ref == (?:'refs\/heads\/main'|format\('refs\/heads\/\{0\}', github\.event\.repository\.default_branch\))/u;

test('saving cache steps run only on trusted default-branch refs', () => {
  for (const file of listFiles()) {
    for (const step of steps(read(file))) {
      const saves = /uses: actions\/cache(?:\/save)?@/u.test(step);
      if (!saves) continue;
      if (pausedSavers.has(file)) continue;
      const condition = step.match(/^\s+if: (.+)$/mu)?.[1] ?? '';
      if (file === '.github/actions/cache-supabase-images/action.yml') {
        // supabase-image-cache.js computes `save` from main push/dispatch.
        assert.match(condition, /steps\.identity\.outputs\.save == 'true'/u);
        continue;
      }
      if (file === '.github/actions/setup-supabase-baseline/action.yml') {
        assert.match(condition, /github\.ref == 'refs\/heads\/main'/u);
        assert.match(condition, /github\.event_name != 'pull_request'/u);
        continue;
      }
      assert.match(
        condition,
        trustedGate,
        `${file} saves a cache outside trusted default-branch runs`
      );
    }
  }
});

test('the supabase image save flag is computed from main pushes only', () => {
  const source = read('scripts/ci/supabase-image-cache.js');
  assert.match(
    source,
    /ref === 'refs\/heads\/main' &&\s*\['push', 'workflow_dispatch'\]\.includes\(eventName\)/u
  );
});

test('toolchain setup actions never save their own caches', () => {
  for (const file of listFiles()) {
    for (const step of steps(read(file))) {
      if (/uses: subosito\/flutter-action@/u.test(step)) {
        assert.doesNotMatch(
          step,
          /^\s+(?:cache|pub-cache): ['"]?true/mu,
          `${file} lets flutter-action save the multi-GB SDK or pub cache`
        );
      }
      if (/uses: actions\/setup-java@/u.test(step)) {
        assert.doesNotMatch(
          step,
          /^\s+cache:/mu,
          `${file} lets setup-java save a branch-scoped Gradle cache`
        );
      }
    }
  }
});

test('Flutter jobs restore pub caches and save them only through the trusted action', () => {
  const setup = read('.github/actions/setup-flutter-cached/action.yml');
  assert.doesNotMatch(setup, /actions\/cache(?:\/save)?@/u);
  assert.match(setup, /actions\/cache\/restore@[0-9a-f]{40}/u);
  assert.match(setup, /cache: "false"/u);
  assert.match(setup, /pub-cache: "false"/u);
  assert.match(setup, /runner\.os[\s\S]*runner\.arch/u);

  const save = read('.github/actions/save-trusted-cache/action.yml');
  assert.match(save, /actions\/cache\/save@[0-9a-f]{40}/u);
  assert.match(save, /inputs\.cache-hit != 'true'/u);
  assert.match(save, /github\.event_name != 'pull_request_target'/u);

  let users = 0;
  for (const file of listFiles().filter((name) => name.includes('workflows'))) {
    const source = read(file);
    const setups = source.match(
      /uses: \.\/\.github\/actions\/setup-flutter-cached/gu
    );
    if (!setups) continue;
    users += setups.length;
    const pubGets = source.match(/flutter pub get/gu)?.length ?? 0;
    const pubSaves =
      source.match(/key: \$\{\{ steps\.flutter\.outputs\.pub-cache-key \}\}/gu)
        ?.length ?? 0;
    // Jobs that resolve dependencies explicitly also save the shared entry.
    assert.ok(pubSaves > 0 || pubGets === 0, `${file} never saves pub cache`);
    assert.ok(pubSaves <= setups.length, file);
  }
  assert.ok(users >= 10, 'expected the mobile and desktop jobs to use it');
});
