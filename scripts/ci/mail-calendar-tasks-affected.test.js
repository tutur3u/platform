const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const root = path.resolve(__dirname, '../..');
const load = import('./mail-calendar-tasks-affected.ts');
const manifest = (name, dependencies = []) => ({
  name: `@tuturuuu/${name}`,
  path: `${['mail', 'calendar', 'tasks', 'web', 'infrastructure'].includes(name) ? 'apps' : 'packages'}/${name}`,
  dependencies: dependencies.map((dep) => `@tuturuuu/${dep}`),
});
const manifests = [
  manifest('mail', ['auth']),
  manifest('tasks', ['tasks-ui']),
  manifest('web', ['shared']),
  manifest('calendar', ['calendar-lib']),
  manifest('infrastructure', ['gateway']),
  manifest('gateway'),
  manifest('tasks-ui', ['shared']),
  manifest('auth', ['shared']),
  manifest('shared'),
  manifest('calendar-lib'),
  manifest('unrelated'),
];
const all = { mail: true, tasks: true, web: true, calendar: true };
async function decision(files, overrides = {}) {
  const { getMailCalendarTasksAffected } = await load;
  return getMailCalendarTasksAffected({
    changedFiles: files,
    eventName: 'pull_request',
    workspaceManifests: manifests,
    ...overrides,
  });
}

test('app-only edits select owning builds and all Calendar consumer checks', async () => {
  for (const [app, expected] of Object.entries({
    mail: { mail: true, tasks: false, web: false, calendar: false },
    tasks: { mail: false, tasks: true, web: false, calendar: true },
    web: { mail: false, tasks: false, web: true, calendar: true },
    calendar: { mail: false, tasks: false, web: false, calendar: true },
  })) {
    assert.deepEqual(await decision([`apps/${app}/src/changed.ts`]), expected);
  }
});

test('direct, transitive and combined edits invalidate dependent jobs', async () => {
  assert.deepEqual(await decision(['packages/shared/src/index.ts']), all);
  assert.deepEqual(await decision(['packages/tasks-ui/src/index.ts']), {
    mail: false,
    tasks: true,
    web: false,
    calendar: true,
  });
  assert.deepEqual(await decision(['packages/calendar-lib/package.json']), {
    mail: false,
    tasks: false,
    web: false,
    calendar: true,
  });
  assert.deepEqual(await decision(['apps/mail/a.ts', 'apps/web/b.ts']), {
    mail: true,
    tasks: false,
    web: true,
    calendar: true,
  });
});

test('proven unrelated workspace edits avoid heavy jobs', async () => {
  assert.deepEqual(await decision(['packages/unrelated/src/index.ts']), {
    mail: false,
    tasks: false,
    web: false,
    calendar: false,
  });
  assert.deepEqual(await decision(['.\\apps\\mail\\package.json']), {
    mail: true,
    tasks: false,
    web: false,
    calendar: false,
  });
});

test('global controls, unknown paths, absent ranges and manual runs fail open', async () => {
  for (const files of [
    null,
    [],
    ['bun.lock'],
    ['package.json'],
    ['turbo.json'],
    ['patches/provider.patch'],
    ['.github/actions/setup-bun-with-retry/action.yml'],
    ['.github/workflows/ci-check.yml'],
    ['tuturuuu.ci.ts'],
    ['tuturuuu.ts'],
    ['scripts/ci/calendar-native-artifact.mjs'],
    ['packages/deleted/file.ts'],
    ['apps/unknown/package.json'],
  ]) {
    assert.deepEqual(await decision(files), all, JSON.stringify(files));
  }
  assert.deepEqual(
    await decision(['packages/unrelated/a.ts'], {
      eventName: 'workflow_dispatch',
    }),
    all
  );
  for (const workspaceManifests of [
    [],
    manifests.filter((m) => !m.name.endsWith('/calendar')),
    manifests.filter((m) => !m.name.endsWith('/shared')),
  ]) {
    assert.deepEqual(
      await decision(['apps/mail/a.ts'], { workspaceManifests }),
      all
    );
  }
});

test('the real CLI emits decisions using every dependency category', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'affected-validation-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const writeManifest = (item) => {
    const dir = path.join(temp, item.path);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: item.name,
        [item.name.endsWith('/mail')
          ? 'devDependencies'
          : item.name.endsWith('/web')
            ? 'peerDependencies'
            : item.name.endsWith('/tasks')
              ? 'optionalDependencies'
              : 'dependencies']: Object.fromEntries(
          item.dependencies.map((dep) => [dep, 'workspace:*'])
        ),
      })
    );
  };
  manifests.forEach(writeManifest);
  const output = path.join(temp, 'output');
  execFileSync(
    process.execPath,
    [
      'scripts/ci/check-workflow-config.ts',
      '--workflow',
      'mail-calendar-tasks-builds.yaml',
      '--event-name',
      'pull_request',
      '--root-dir',
      temp,
      '--changed-files',
      'packages/shared/src/index.ts',
    ],
    {
      cwd: root,
      env: { ...process.env, GITHUB_OUTPUT: output, CHANGED_FILES_FILE: '' },
    }
  );
  const values = Object.fromEntries(
    fs
      .readFileSync(output, 'utf8')
      .trim()
      .split('\n')
      .map((line) => [
        line.slice(0, line.indexOf('=')),
        line.slice(line.indexOf('=') + 1),
      ])
  );
  assert.equal(values.should_run, 'true');
  assert.deepEqual(JSON.parse(values.affected_jobs), all);
});

test('workflow keeps check names, mandatory commands, restore dependency and gate wiring', () => {
  const workflow = readWorkflow('mail-calendar-tasks-builds.yaml');
  const preflight = readWorkflow('ci-check.yml');
  assert.ok(preflight.on.workflow_call.outputs.affected_jobs);
  assert.ok(preflight.jobs.check.outputs.affected_jobs);
  const checkout = preflight.jobs.check.steps.find((step) =>
    step.uses?.startsWith('actions/checkout@')
  );
  assert.ok(
    checkout.with['sparse-checkout'].includes(
      'scripts/ci/mail-calendar-tasks-affected.ts'
    )
  );
  for (const app of ['mail', 'tasks', 'web']) {
    const job = workflow.jobs[`build-${app}`];
    assert.equal(job.name, `build (${app})`);
    assert.equal(job.needs, 'check-ci');
    assert.equal(
      job.if,
      `needs.check-ci.outputs.should_run == 'true' && toJSON(fromJSON(needs.check-ci.outputs.affected_jobs || '{}').${app}) != 'false'`
    );
    const build = job.steps.find((step) =>
      step.with?.command?.includes('run build')
    );
    assert.equal(
      build.with.command,
      `bun turbo:local run build --concurrency=2 --filter=@tuturuuu/${app}`
    );
    assert.equal(build.if, undefined);
    assert.equal(build['continue-on-error'], undefined);
    assert.equal(job['timeout-minutes'], 45);
  }
  const native = workflow.jobs['calendar-native'];
  assert.equal(
    native.if,
    "needs.check-ci.outputs.should_run == 'true' && toJSON(fromJSON(needs.check-ci.outputs.affected_jobs || '{}').calendar) != 'false'"
  );
  assert.equal(
    workflow.jobs['calendar-artifact-restore'].needs,
    'calendar-native'
  );
  assert.equal(workflow.jobs['calendar-artifact-restore'].if, undefined);
  const commands = native.steps
    .flatMap((step) => [step.run ?? '', step.with?.command ?? ''])
    .join('\n');
  for (const command of [
    'bun run --cwd apps/calendar test',
    'bun run --cwd apps/web test',
    'bun run --cwd packages/tasks-ui test',
    '--filter=@tuturuuu/tasks',
    '--filter=@tuturuuu/tasks-ui',
    'calendar-native-worker.runtime.mjs',
  ]) {
    assert.ok(commands.includes(command), command);
  }
});

test('cross-workspace renames invalidate the removed source as well as the destination', async (t) => {
  const { git, initializeGitRepo } = require('./workflow-config-test-helpers');
  const { resolveChangedFiles } = await import(
    './resolve-changed-files-core.ts'
  );
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'affected-rename-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const before = 'apps/mail/source.ts';
  const after = 'packages/unrelated/source.ts';
  for (const name of [before, after])
    fs.mkdirSync(path.dirname(path.join(temp, name)), { recursive: true });
  fs.writeFileSync(path.join(temp, before), 'export const unchanged = true;\n');
  const base = initializeGitRepo(temp);
  git(temp, ['mv', before, after]);
  git(temp, ['commit', '-m', 'move across workspaces']);
  const head = git(temp, ['rev-parse', 'HEAD']);
  const eventPath = path.join(temp, 'event.json');
  fs.writeFileSync(
    eventPath,
    JSON.stringify({
      pull_request: { base: { sha: base }, head: { sha: head } },
    })
  );
  // The former rename-aware name-only diff loses the source path.
  assert.equal(git(temp, ['diff', '--name-only', '-M', base, head]), after);
  const result = await resolveChangedFiles({
    rootDir: temp,
    eventName: 'pull_request',
    eventPath,
  });
  assert.equal(result.available, true);
  assert.deepEqual(result.files, [before, after]);
  assert.equal((await decision(result.files)).mail, true);
});

test('required skill and docs prose does not invalidate unrelated app builds', async () => {
  const prose = [
    'plugins/tuturuuu/skills/tuturuuu-platform/references/platform-patterns.md',
    'apps/docs/platform/calendar.mdx',
  ];
  assert.deepEqual(await decision(['apps/mail/src/index.ts', ...prose]), {
    mail: true,
    tasks: false,
    web: false,
    calendar: false,
  });
  assert.deepEqual(await decision(prose), {
    mail: false,
    tasks: false,
    web: false,
    calendar: false,
  });
  for (const file of [
    'plugins/tuturuuu/scripts/validator.py',
    'plugins/tuturuuu/plugin.json',
    'apps/docs/package.json',
    'scripts/ci/guard.md',
    'plugins/other/policy.md',
  ]) {
    assert.deepEqual(await decision(['apps/mail/src/index.ts', file]), all);
  }
});

test('Calendar diagnostics retain the directly imported infrastructure gateway and its dependencies', async () => {
  for (const file of [
    'apps/infrastructure/src/lib/mobile-calendar/gateway.ts',
    'packages/gateway/index.ts',
  ]) {
    assert.deepEqual(await decision(['apps/mail/src/index.ts', file]), {
      mail: true,
      tasks: false,
      web: false,
      calendar: true,
    });
  }
});

test('job admission skips only explicit false and retains missing output validation', () => {
  const vm = require('node:vm');
  const workflow = readWorkflow('mail-calendar-tasks-builds.yaml');
  for (const [name, key] of [
    ['build-mail', 'mail'],
    ['build-tasks', 'tasks'],
    ['build-web', 'web'],
    ['calendar-native', 'calendar'],
  ]) {
    const expression = workflow.jobs[name].if.replaceAll(
      'needs.check-ci',
      'preflight'
    );
    for (const value of [undefined, null, true, false, 'false']) {
      const scope = {
        preflight: {
          outputs: {
            should_run: 'true',
            affected_jobs: JSON.stringify({ [key]: value }),
          },
        },
        fromJSON: JSON.parse,
        toJSON: (item) => JSON.stringify(item ?? null),
      };
      assert.equal(
        vm.runInNewContext(expression, scope),
        value !== false,
        `${name}: ${value}`
      );
      scope.preflight.outputs.affected_jobs = '';
      assert.equal(vm.runInNewContext(expression, scope), true);
      scope.preflight.outputs.should_run = 'false';
      assert.equal(vm.runInNewContext(expression, scope), false);
    }
  }
});
