const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { readAllWorkflows } = require('./workflow-yaml-test-helper.js');
const { trustedSave } = require('./supabase-image-cache.js');

const workflows = readAllWorkflows();
const actions = JSON.parse(
  execFileSync(
    'bun',
    [
      '-e',
      `
    const fs = require('node:fs');
    const out = {};
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = dir + '/' + entry.name;
        if (entry.isDirectory()) walk(file);
        else if (/^action\\.ya?ml$/.test(entry.name))
          out[file] = Bun.YAML.parse(fs.readFileSync(file, 'utf8'));
      }
    }
    walk('.github/actions');
    console.log(JSON.stringify(out));
  `,
    ],
    { encoding: 'utf8' }
  )
);

test('budget inventory catches an unnamed Android cache outside known key families', () => {
  const step = {
    uses: 'actions/cache@sha',
    with: {
      path: '~/.android/build-cache',
      key: `android-${expression('github.sha')}`,
    },
  };
  assert.ok(isCacheWriter(step));
  assert.throws(() => assertTrustedSave(step, 'crafted.yaml'));
});

function ghaExports(step) {
  const commands = [step.run, step.with?.command].filter(Boolean).join('\n');
  const inline = [
    ...commands.matchAll(
      /(?:--cache-to[ =]+|[A-Z_]+_TO=)["']?(type=gha[^\s"']*)/g
    ),
  ].map((match) => match[1]);
  const explicit = [
    step.with?.['cache-to'],
    ...Object.entries(step.env || {})
      .filter(([key]) => key.endsWith('_TO'))
      .map(([, value]) => value),
  ].filter((value) => typeof value === 'string' && /type=gha/.test(value));
  return [...inline, ...explicit];
}

function cacheControls(step) {
  const defaults = step.uses?.startsWith('Swatinem/rust-cache@')
    ? { 'save-if': true }
    : step.uses?.startsWith('docker/setup-buildx-action@')
      ? { 'cache-binary': true }
      : {};
  return [
    ...new Set([
      'cache',
      'pub-cache',
      'enable-cache',
      ...Object.keys(defaults),
    ]),
  ]
    .map((field) => [field, step.with?.[field] ?? defaults[field]])
    .filter(
      ([, value]) => value !== undefined && value !== false && value !== 'false'
    );
}

function isCacheWriter(step) {
  if (
    ghaExports(step).length ||
    /^actions\/cache(?:\/save)?@/.test(step.uses || '')
  )
    return true;
  if (!step.uses || step.uses.startsWith('actions/cache/restore@'))
    return false;
  return cacheControls(step).length > 0;
}

const expression = (body) => `\${{ ${body} }}`;
// Exact input sets prevent these exceptions from admitting new paths or keys.
const exemptions = [
  ...[
    ['rust-backend.yml', 'docker', undefined],
    [
      'docker-setup-check.yaml',
      'verify',
      { 'driver-opts': 'image=moby/buildkit:buildx-stable-1' },
    ],
    ...['prepare-e2e-images', 'e2e', 'migration-e2e'].map((job) => [
      'e2e-tests.yaml',
      job,
      undefined,
    ]),
  ].map(([file, job, inputs]) => ({
    file,
    job,
    uses: 'docker/setup-buildx-action@',
    with: inputs,
    reason:
      'Explicit Buildx executable-only cache exemption; the action defaults cache-binary to true, independently of Docker layer exports.',
  })),
  ...['verify', 'deploy-backend'].map((job) => ({
    file: 'rust-backend.yml',
    job,
    uses: 'Swatinem/rust-cache@',
    with: {
      'shared-key': 'backend',
      key: 'native-and-worker',
      workspaces: 'apps/backend -> target',
      'save-if': expression(
        "github.ref == 'refs/heads/main' || github.ref == 'refs/heads/production'"
      ),
    },
    paused: true,
    reason:
      'Retained Cargo source is disabled by the Rust workflow switchboard; reactivation requires reviewing this source-only classification.',
  })),

  ...['e2e', 'inventory-storefront-cache-e2e'].map((job) => ({
    file: 'e2e-tests.yaml',
    job,
    uses: 'actions/cache/save@',
    with: {
      path: 'tmp/e2e-proof-receipt.json',
      key: expression(
        job === 'e2e'
          ? 'matrix.cache_key'
          : 'needs.relevance.outputs.inventory_key'
      ),
    },
    reason:
      'Small sanitized E2E proof JSON, not dependency or Docker payloads; receipt validation has separate coverage.',
  })),
  {
    file: 'codex-plugin.yaml',
    job: 'validate',
    uses: 'actions/setup-python@',
    with: {
      'python-version': '3.13',
      cache: 'pip',
      'cache-dependency-path': 'plugins/tuturuuu/mcp/requirements.lock',
    },
    reason:
      'Explicit Python tooling download-cache exemption, scoped to the hash-pinned MCP requirements lock; no SDK/build outputs.',
  },
  ...[
    'lint',
    'type-check',
    'test',
    'test-coverage',
    'build-check',
    'security',
    'matrix-test',
  ].map((job) => ({
    file: 'discord-python-ci.yml',
    job,
    uses: 'astral-sh/setup-uv@',
    with: {
      'enable-cache': true,
      'prune-cache': true,
      'cache-dependency-glob': 'apps/discord/uv.lock',
    },
    reason:
      'Explicit Discord uv download-cache exemption; pruned and keyed by its owning lockfile, with dedicated workflow tests.',
  })),
  {
    file: 'discord-modal-deploy.yml',
    job: 'deploy',
    uses: 'astral-sh/setup-uv@',
    with: {
      'enable-cache': 'auto',
      'prune-cache': true,
      'cache-dependency-glob': 'apps/discord/uv.lock',
    },
    reason:
      'Same pruned uv download scope; auto disables caching for sensitive workflow_run deployment events.',
  },
];

function exemptWriter(file, job, step) {
  return exemptions.find(
    (entry) =>
      entry.file === file &&
      entry.job === job &&
      step.uses?.startsWith(entry.uses) &&
      isDeepStrictEqual(step.with, entry.with)
  );
}

test('cache inventory includes explicit saves, lookup-only post saves, and setup cache inputs', () => {
  for (const step of [
    { uses: 'actions/cache/save@sha', with: { key: 'unfamiliar' } },
    { uses: 'actions/cache@sha', with: { 'lookup-only': true } },
    { uses: 'vendor/setup-tool@sha', with: { cache: true } },
    { uses: 'Swatinem/rust-cache@sha' },
    { uses: 'docker/setup-buildx-action@sha' },
    { run: 'docker buildx build --cache-to type=gha,scope=unknown .' },
    { with: { 'cache-to': 'type=gha,scope=unknown' } },
    { env: { DOCKER_WEB_CACHE_WEB_TO: 'type=gha,scope=unknown' } },
    { uses: 'vendor/setup-tool@sha', with: { 'enable-cache': 'auto' } },
  ]) {
    assert.ok(isCacheWriter(step));
    assert.equal(exemptWriter('unknown.yaml', 'job', step), undefined);
    assert.throws(() => assertWriterPolicy(step, 'unknown.yaml'));
  }
  assert.equal(isCacheWriter({ uses: 'actions/cache/restore@sha' }), false);
  assert.equal(
    isCacheWriter({ uses: 'vendor/setup-tool@sha', with: { cache: false } }),
    false
  );
  for (const entry of exemptions) {
    const step = { uses: `${entry.uses}sha`, with: entry.with };
    assert.equal(exemptWriter(entry.file, entry.job, step), entry);
    assert.equal(
      exemptWriter(entry.file, entry.job, {
        ...step,
        with: { ...entry.with, path: '~/.android/build-cache' },
      }),
      undefined
    );
  }
});

function assertPausedSource(file, job, group) {
  if (file !== 'rust-backend.yml') {
    assert.equal(
      group.if,
      expression('false'),
      `${file}:${job} must remain paused`
    );
    return;
  }
  assert.match(
    fs.readFileSync('tuturuuu.ci.ts', 'utf8'),
    /'rust-backend.yml': false/
  );
  assert.equal(
    workflows[file].jobs['check-ci'].uses,
    './.github/workflows/ci-check.yml'
  );
  if (job === 'verify' || job === 'docker') {
    assert.equal(group.if, "needs.check-ci.outputs.should_run == 'true'");
    assert.ok([group.needs].flat().includes('check-ci'));
  } else {
    assert.ok([group.needs].flat().includes('cloudflare-deployment-preflight'));
    assert.match(
      group.if,
      /needs\.cloudflare-deployment-preflight\.outputs\.can_deploy == 'true'/
    );
    assert.match(
      workflows[file].jobs['cloudflare-deployment-preflight'].if,
      /needs\.check-ci\.outputs\.should_run == 'true'/
    );
  }
}

const pausedExports = [
  [
    'docker-setup-check.yaml',
    'verify',
    'Build web dev image',
    ['docker-web-dev'],
  ],
  [
    'docker-setup-check.yaml',
    'verify',
    'Build web prod image',
    ['docker-web-prod'],
  ],
  [
    'docker-setup-check.yaml',
    'verify',
    'Build TanStack web prod image',
    ['docker-tanstack-web-prod'],
  ],
  [
    'docker-setup-check.yaml',
    'verify',
    'Build storage unzip proxy image',
    ['docker-storage-unzip-proxy'],
  ],
  ['rust-backend.yml', 'docker', 'Build backend image', ['docker-backend']],
  [
    'e2e-tests.yaml',
    'prepare-e2e-images',
    'Configure trusted BuildKit cache exports',
    [
      'docker-chat-realtime',
      'docker-hive-prod',
      'docker-hive-realtime',
      'docker-markitdown',
      'docker-meet-realtime',
      'docker-supermemory',
    ],
  ],
];

function pausedExport(file, job, step, group) {
  const entry = pausedExports.find(
    ([f, j, name]) => file === f && job === j && step.name === name
  );
  if (!entry) return undefined;
  assertPausedSource(file, job, group);
  assert.deepEqual(
    ghaExports(step).map((value) => value.match(/scope=([^,]+)/)?.[1]),
    entry[3]
  );
  return entry;
}

function savePolicy(step) {
  const mobileDependencies = /gradle|CocoaPods/i.test(
    `${step.with?.key} ${step.with?.path}`
  );
  return {
    refs: ['refs/heads/main'],
    events: mobileDependencies ? ['push'] : ['push', 'workflow_dispatch'],
  };
}

function assertTrustedSave(step, label, policy = savePolicy(step)) {
  assert.ok(
    step.if,
    `${label}: heavyweight cache writer needs a trusted-ref/event guard`
  );
  const expression = step.if
    .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
    .replace(/steps\.([\w-]+)\.outputs\.([\w-]+)/g, 'outputs["$1.$2"]');
  const evaluate = Function(
    'github',
    'outputs',
    'success',
    'always',
    'format',
    'inputs',
    `return !!(${expression})`
  );
  let admitted = false;
  for (const ref of [
    'refs/heads/main',
    'refs/heads/production',
    'refs/heads/feature/a',
    'refs/pull/7/merge',
  ]) {
    for (const event_name of [
      'push',
      'workflow_dispatch',
      'pull_request',
      'pull_request_target',
      'workflow_run',
      'schedule',
    ]) {
      for (const actor of ['contributor', 'dependabot[bot]']) {
        for (const value of ['true', 'false', '']) {
          // Treat output-based save flags as attacker-controlled: they cannot replace the trust guard.
          const outputs = new Proxy(
            {},
            { get: (_, key) => (key.endsWith('.cache-hit') ? 'false' : value) }
          );
          let saves;
          try {
            saves = evaluate(
              {
                ref,
                event_name,
                actor,
                event: { repository: { default_branch: 'main' } },
              },
              outputs,
              () => true,
              () => true,
              (pattern, value) => pattern.replace('{0}', value),
              new Proxy({}, { get: () => value })
            );
          } catch (error) {
            throw new Error(`${label}: unsupported save guard ${step.if}`, {
              cause: error,
            });
          }
          const trusted =
            policy.refs.includes(ref) && policy.events.includes(event_name);
          assert.ok(
            !saves || trusted,
            `${label}: cache save admitted ${event_name} on ${ref}`
          );
          admitted ||= saves;
        }
      }
    }
  }
  assert.ok(
    admitted,
    `${label}: save guard must allow a trusted cache producer`
  );
}

function assertWriterPolicy(step, label, policy = savePolicy(step)) {
  if (
    /^actions\/cache(?:\/save)?@/.test(step.uses || '') ||
    ghaExports(step).length
  ) {
    assertTrustedSave(step, label, policy);
    return;
  }
  const controls = cacheControls(step);
  assert.ok(
    controls.length > 0,
    `${label}: detected writer has no validation branch`
  );
  for (const [field, value] of controls) {
    const guard =
      typeof value === 'string' && value.startsWith('${{') ? value : step.if;
    assertTrustedSave({ if: guard }, `${label}: ${field}`, policy);
  }
}

test('every workflow/composite cache writer is trusted or has an exact documented exemption', () => {
  let writers = 0;
  const seenExemptions = new Set();
  const seenPausedExports = new Set();
  for (const [file, document] of Object.entries({ ...workflows, ...actions })) {
    const groups = document.runs ? { composite: document.runs } : document.jobs;
    for (const [job, group] of Object.entries(groups)) {
      assert.equal(
        ghaExports({ env: { ...document.env, ...group.env } }).length,
        0,
        `${file}:${job}: declare GHA exports in individually classified steps`
      );
      for (const step of group.steps || []) {
        if (!isCacheWriter(step)) continue;
        writers++;
        if (ghaExports(step).length) {
          const paused = pausedExport(file, job, step, group);
          if (paused) {
            seenPausedExports.add(paused);
            continue;
          }
          assertTrustedSave(
            step,
            `${file}:${job}: unclassified BuildKit export`
          );
          continue;
        }
        const exemption = exemptWriter(file, job, step);
        if (exemption) {
          if (exemption.paused) assertPausedSource(file, job, group);
          assert.ok(exemption.reason.length > 30);
          seenExemptions.add(exemption);
          continue;
        }
        const policy = savePolicy(step);
        assertWriterPolicy(
          step,
          `${file}:${job}: ${step.name || step.uses}`,
          policy
        );
      }
    }
  }
  assert.equal(
    seenPausedExports.size,
    pausedExports.length,
    'remove stale paused export classifications'
  );
  assert.ok(
    writers >= 20,
    'must inventory explicit and implicit cache writers'
  );
  assert.equal(
    seenExemptions.size,
    exemptions.length,
    'remove stale exemptions'
  );
});

test('Gradle restores never register setup-java post-job saves', () => {
  let restores = 0;
  for (const [file, document] of Object.entries({ ...workflows, ...actions })) {
    const groups = document.runs
      ? [document.runs.steps]
      : Object.values(document.jobs).map((job) => job.steps || []);
    for (const steps of groups) {
      for (const step of steps) {
        if (step.uses?.startsWith('actions/setup-java@'))
          assert.notEqual(
            step.with?.cache,
            'gradle',
            `${file}: use explicit restore and trusted save`
          );
        if (
          step.uses?.startsWith('actions/cache/restore@') &&
          step.with?.key?.startsWith('gradle-v1-')
        )
          restores++;
      }
    }
  }
  assert.equal(restores, 2);
});

test('mobile Gradle and CocoaPods saves use exactly the restored identity and paths', () => {
  let pairs = 0;
  for (const [file, workflow] of Object.entries(workflows)) {
    for (const job of Object.values(workflow.jobs)) {
      const steps = job.steps || [];
      for (const restore of steps.filter((step) =>
        ['gradle-cache', 'pods-cache'].includes(step.id)
      )) {
        assert.match(restore.uses, /^actions\/cache\/restore@/);
        const save = steps.find(
          (step) =>
            step.uses?.startsWith('actions/cache/save@') &&
            step.with?.key === restore.with.key
        );
        if (file === 'mobile-deploy-stores.yaml') {
          assert.equal(
            save,
            undefined,
            'production restores main caches without registering unreachable saves'
          );
          continue;
        }
        assert.ok(save, `missing save for ${restore.name}`);
        assert.equal(save.with.path, restore.with.path);
        assert.match(
          save.if,
          /github.ref == 'refs\/heads\/main' && github.event_name == 'push'/
        );
        assert.equal(
          restore.if,
          undefined,
          'untrusted refs must still restore'
        );
        pairs++;
      }
    }
  }
  assert.equal(pairs, 3);
});

test('budget guard rejects implicit Gradle saves and incomplete or bypassed trust guards', () => {
  const step = { uses: 'actions/setup-java@sha', with: { cache: 'gradle' } };
  assert.ok(isCacheWriter(step));
  for (const guard of [
    undefined,
    "github.ref == 'refs/heads/main'",
    "github.event_name != 'pull_request'",
    "github.ref == 'refs/heads/main' && github.event_name == 'push' || true",
  ]) {
    assert.throws(() => assertTrustedSave({ ...step, if: guard }, 'fixture'));
  }
});

test('budget policies reject production saves and dispatch saves for Gradle/Pods', () => {
  for (const file of [
    'bun/action.yml',
    'cache-supabase-images/action.yml',
    'setup-flutter-with-cache/action.yml',
  ]) {
    assert.throws(() =>
      assertTrustedSave(
        {
          if: "github.ref == 'refs/heads/production' && github.event_name == 'push'",
        },
        file
      )
    );
  }
  for (const dependency of ['~/.gradle/caches', '~/Library/Caches/CocoaPods']) {
    assert.throws(() =>
      assertTrustedSave(
        {
          with: { path: dependency },
          if: "github.ref == 'refs/heads/main' && github.event_name == 'workflow_dispatch'",
        },
        'mobile.yaml'
      )
    );
  }
});

test('Bun runtime and dependencies keep version/platform keys without lockfile hashes', () => {
  const action = actions['.github/actions/setup-bun-with-retry/action.yml'];
  const version = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')
  ).packageManager.replace(/^bun@/, '');
  assert.equal(action.inputs['bun-version'].default, version);
  for (const family of ['runtime', 'deps']) {
    const caches = action.runs.steps.filter((step) =>
      step.with?.key?.startsWith(`bun-${family}-`)
    );
    assert.equal(caches.length, 2);
    const expected = `bun-${family}-v2-${expression('runner.os')}-${expression('runner.arch')}-${expression('inputs.bun-version')}`;
    for (const step of caches) {
      assert.equal(step.with.key, expected);
      assert.equal(
        step.with['restore-keys'],
        undefined,
        'old lock generations must age out'
      );
      assert.doesNotMatch(
        step.with.key,
        /hashFiles|github\.sha|run_id|run_attempt/
      );
    }
  }
  for (const [name, workflow] of Object.entries(workflows))
    assert.doesNotMatch(
      JSON.stringify(workflow),
      /1\.4\.3/,
      `${name} still pins retired Bun 1.4.3`
    );
});

test('the composite save input fences both archive creation and upload', () => {
  const action = actions['.github/actions/cache-supabase-images/action.yml'];
  assert.equal(action.inputs.save.default, 'true');
  assert.equal(action.inputs['seed-image-catalog'].default, 'current');
  const pull = action.runs.steps.find(
    (step) => step.name === 'Pull missing images within a short budget'
  );
  const upload = action.runs.steps.find(
    (step) => step.name === 'Save trusted image archive'
  );
  const identityStep = action.runs.steps.find((step) => step.id === 'identity');
  assert.equal(
    pull.env.IMAGE_SEED_CATALOG,
    identityStep.env.IMAGE_SEED_CATALOG
  );
  assert.equal(pull.env.IMAGE_PROFILE, identityStep.env.IMAGE_PROFILE);
  const evaluate = (expression, inputs, github) => {
    const code = expression
      .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
      .replace(/steps\.([\w-]+)\.outputs\.([\w-]+)/g, 'outputs["$1.$2"]');
    return Function(
      'inputs',
      'github',
      'outputs',
      `return !!(${code})`
    )(inputs, github, {
      'identity.save': String(trustedSave(github.event_name, github.ref)),
      'cache.cache-hit': 'false',
    });
  };
  for (const save of ['true', 'false', '', 'invalid']) {
    for (const ref of ['refs/heads/main', 'refs/pull/1/merge']) {
      const github = { ref, event_name: 'push' };
      const expected = save === 'true' && ref === 'refs/heads/main';
      assert.equal(evaluate(pull.env.IMAGE_SAVE, { save }, github), expected);
      assert.equal(evaluate(upload.if, { save }, github), expected);
    }
  }
});
