const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { selectLocalChecks } = require('../ci/check-map.js');
const { main } = require('../check-changed.js');
const {
  I18N_USAGE_CHECKS,
  I18N_USAGE_ROOTS,
  i18nUsageSteps,
  i18nUsageUntrackedNote,
} = require('./i18n-usage.js');
const { planChecks } = require('./plan.js');

const ROOT = path.resolve(__dirname, '../..');
const STEP_IDS = I18N_USAGE_CHECKS.map((check) => check.id);
const selects = (...files) => selectLocalChecks(files).has('i18n-usage');

test('source that an app can render selects the translation usage checks', () => {
  for (const file of [
    // A component that calls useTranslations, and a file that only imports
    // one: the checks follow imports, so either can change what an app needs.
    'apps/track/src/components/settings/settings-dialog.tsx',
    'apps/track/src/app/[locale]/user-nav-client.tsx',
    'packages/ui/src/hooks/use-mobile.ts',
    'packages/satellite/src/components/apps-launcher-core.tsx',
    'packages/tasks-ui/src/tu-do/boards/board.tsx',
    'apps/cms/src/app/[locale]/(dashboard)/[wsId]/members/page.tsx',
    'apps/web/src/i18n/client-messages.ts',
    'apps/mastermind/src/components/inbox.tsx',
    'apps/colab/src/client/shell.jsx',
    'packages/roadmap-core/src/index.mjs',
    // Package exports can point outside `src`, and the tracer follows them.
    'packages/transactional/react/email/index.ts',
    'packages/transactional/emails/workspace-invite.tsx',
  ])
    assert.equal(selects(file), true, file);
});

test('bundles, dependency manifests and the checks themselves select them too', () => {
  for (const file of [
    'apps/cms/messages/en.json',
    'apps/cms/messages/vi.json',
    'apps/marketing/messages/edufest-2026.en.json',
    // apps/roadmap is checked against the bundle its package ships.
    'packages/roadmap-core/messages/en.json',
    // The namespace check reads an app's shared UI dependencies, and the
    // import tracer reads a package's export map.
    'apps/mastermind/package.json',
    'packages/ui/package.json',
    // Modules the settings check loads resolve `@/` and workspace packages
    // through the app's config, the shared base it extends and the root
    // workspace manifest.
    'apps/marketing/tsconfig.json',
    'packages/typescript-config/nextjs.json',
    'package.json',
    'scripts/i18n-rendered-keys.js',
    'scripts/i18n-rendered-settings.js',
    'scripts/i18n-rendered-imports.js',
    'scripts/i18n-source-key-scan.js',
    'scripts/i18n-namespace-check.js',
    'scripts/i18n-namespace-check.config.json',
    'scripts/i18n-namespace-apps.js',
    'scripts/i18n-namespace-policy.js',
    'scripts/i18n-launcher-translations.js',
    'scripts/paused-runtimes.js',
    // The launcher check reads the launchable app registry.
    'packages/utils/src/launchable-apps.ts',
  ])
    assert.equal(selects(file), true, file);
});

test('every script the commands require by a literal relative path selects the checks', () => {
  const loaded = new Set();
  const visit = (file) => {
    if (loaded.has(file)) return;
    loaded.add(file);
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const [, local] of source.matchAll(
      /require\(\s*'\.\/([^']+)'\s*\)/gu
    )) {
      const base = path.posix.join(path.posix.dirname(file), local);
      const target = [base, `${base}.js`, `${base}.json`].find((candidate) =>
        fs.existsSync(path.join(ROOT, candidate))
      );
      assert.ok(target, `${local} required by ${file}`);
      if (target.endsWith('.js')) visit(target);
      else loaded.add(target);
    }
  };
  for (const check of I18N_USAGE_CHECKS) visit(check.args[0]);
  assert.ok(loaded.size > I18N_USAGE_CHECKS.length);
  for (const file of loaded) assert.equal(selects(file), true, file);
});

test('files the commands load by a computed path select the checks too', () => {
  for (const file of [
    // i18n-rendered-settings.js requires these from the app it audits.
    'apps/web/src/i18n/client-messages.ts',
    'apps/workspace/src/i18n/client-messages.ts',
    'apps/marketing/src/i18n/client-messages.ts',
    'apps/marketing/src/lib/marketing-render-context.ts',
    // i18n-namespace-check.js and i18n-launcher-translations.js read these.
    'scripts/i18n-namespace-check.config.json',
    'packages/utils/src/launchable-apps.ts',
    'apps/web/messages/en.json',
    'apps/web/package.json',
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), file);
    assert.equal(selects(file), true, file);
  }
});

test('changes that cannot alter rendered translations leave them out', () => {
  for (const file of [
    'README.md',
    'apps/docs/build/development-tools/pre-push-checks.mdx',
    'apps/mobile/lib/features/mastermind/fleet/data/fleet_thread_models.dart',
    'apps/database/supabase/migrations/20261109090000_example.sql',
    'apps/web/public/logo.svg',
    'apps/web/src/app/globals.css',
    'apps/web/src/lib/data.json',
    'apps/web/' + 'wrang' + 'ler.jsonc',
    'apps/web/vercel.json',
    'packages/ui/README.md',
    'packages/ui/components.json',
    'packages/ui/src/package.json',
    'tsconfig.json',
    'turbo.json',
    'scripts/i18n-sort.js',
    'scripts/i18n-key-parity.js',
    'scripts/i18n-common.js',
    'scripts/check-changed/plan.js',
    '.github/workflows/i18n-check.yaml',
  ])
    assert.equal(selects(file), false, file);
});

test('the steps are the commands of the CI namespace job, in its order', () => {
  const steps = i18nUsageSteps(new Set(['i18n-usage']));
  assert.deepEqual(
    steps.map((step) => step.id),
    ['i18n-rendered-keys', 'i18n-rendered-settings', 'i18n-namespace']
  );
  const workflow = fs.readFileSync(
    path.join(ROOT, '.github/workflows/i18n-check.yaml'),
    'utf8'
  );
  const job = /namespace_output=\$\(\{ ([^;]+); \}/u.exec(workflow)?.[1];
  assert.equal(
    steps.map((step) => [step.command, ...step.args].join(' ')).join(' && '),
    job
  );
  for (const step of steps) {
    // Run from the repository root with no install or build in front.
    assert.equal(step.cwd, undefined);
    assert.equal(step.heavy, undefined);
    assert.ok(fs.existsSync(path.join(ROOT, step.args[0])), step.args[0]);
    assert.match(step.fixHint, /messages\/en\.json and vi\.json/u);
  }
  // Steps are copies: a planner that edits one cannot change the next plan.
  steps[0].args.push('apps/cms');
  assert.deepEqual(I18N_USAGE_CHECKS[0].args, [
    'scripts/i18n-rendered-keys.js',
  ]);
  assert.deepEqual(i18nUsageSteps(new Set(['i18n'])), []);
});

test('the gate plans the checks for translated UI and bundles, not for other changes', () => {
  const context = {
    base: 'abc123',
    oxfmtBinary: '/repo/node_modules/.bin/oxfmt',
    branch: 'chore/gate',
    exists: () => false,
    hasVitest: () => true,
  };
  const planned = (status, file) =>
    planChecks([{ status, file }], context)
      .steps.map((step) => step.id)
      .filter((id) => STEP_IDS.includes(id));
  const page = 'apps/cms/src/app/[locale]/(dashboard)/[wsId]/members/page.tsx';
  assert.deepEqual(planned('M', page), STEP_IDS);
  // A deleted component can leave a parent importing nothing translated, or
  // an app without the file a settings surface is traced from.
  assert.deepEqual(planned('D', page), STEP_IDS);
  assert.deepEqual(
    planned('A', 'packages/ui/src/components/ui/x.tsx'),
    STEP_IDS
  );
  assert.deepEqual(planned('M', 'apps/cms/messages/vi.json'), STEP_IDS);
  assert.deepEqual(planned('M', 'apps/mobile/lib/main.dart'), []);
  assert.deepEqual(planned('M', 'apps/docs/docs.json'), []);

  // A bundle change still runs the sort and parity checks ahead of them.
  const bundle = planChecks(
    [{ status: 'M', file: 'apps/cms/messages/en.json' }],
    context
  ).steps.map((step) => step.id);
  assert.ok(bundle.indexOf('i18n-sort') < bundle.indexOf('i18n-rendered-keys'));
  assert.ok(bundle.includes('i18n-key-parity'));
});

test('the note names untracked paths the checks may read, and only those', () => {
  const steps = i18nUsageSteps(new Set(['i18n-usage']));
  const listing = (files) => `${files.join('\0')}\0`;
  const asked = [];
  const note = i18nUsageUntrackedNote(steps, (args) => {
    asked.push(args);
    return listing([
      'apps/mind/src/app/draft/page.tsx',
      'apps/mind/notes.md',
      'packages/ui/src/components/ui/draft.tsx',
      'apps/cms/messages/en.json',
      'apps/web/public/draft.png',
    ]);
  });
  assert.deepEqual(asked, [
    [
      'ls-files',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      'apps',
      'packages',
    ],
  ]);
  assert.deepEqual(I18N_USAGE_ROOTS, ['apps', 'packages']);
  assert.match(
    note,
    /^ {2}note: the translation checks may read untracked files/u
  );
  for (const file of [
    'apps/mind/src/app/draft/page.tsx',
    'packages/ui/src/components/ui/draft.tsx',
    'apps/cms/messages/en.json',
  ])
    assert.ok(note.includes(JSON.stringify(file)), file);
  assert.equal(note.includes('notes.md'), false);
  assert.equal(note.includes('draft.png'), false);

  // A long list is cut, with the remainder counted.
  const many = Array.from({ length: 14 }, (_, i) => `apps/a/src/f${i}.ts`);
  const long = i18nUsageUntrackedNote(steps, () => listing(many));
  assert.ok(long.includes('"apps/a/src/f9.ts"'));
  assert.equal(long.includes('"apps/a/src/f10.ts"'), false);
  assert.ok(long.endsWith(' and 4 more'));

  // Nothing to say without such paths or when git could not list them, and
  // no listing at all without the checks.
  assert.equal(
    i18nUsageUntrackedNote(steps, () => listing(['apps/a/notes.md'])),
    null
  );
  assert.equal(
    i18nUsageUntrackedNote(steps, () => ''),
    null
  );
  assert.equal(
    i18nUsageUntrackedNote(steps, () => null),
    null
  );
  assert.equal(
    i18nUsageUntrackedNote([{ id: 'oxfmt' }], () => {
      throw new Error('must not list untracked files');
    }),
    null
  );
});

test('the hook notes untracked translation inputs in other workspaces and does not refuse', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-hook-i18n-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const workspace of ['packages/shared', 'apps/other']) {
    fs.mkdirSync(path.join(root, workspace), { recursive: true });
    fs.writeFileSync(
      path.join(root, workspace, 'package.json'),
      JSON.stringify({ name: path.basename(workspace) })
    );
  }
  const head = 'a'.repeat(40);
  const run = (changed, listElsewhere, flags = []) => {
    const logs = [];
    const queries = [];
    const ran = [];
    const events = [];
    const answers = {
      'git config': '',
      'git rev-parse HEAD': head,
      'git status': '',
      'git merge-base': 'base',
      'git diff --name-status': `M\0${changed}\0`,
      'git branch --show-current': 'chore/gate',
    };
    const result = main(['--hook', '--no-ttr', ...flags], {
      root,
      stdin: `refs/heads/fix/x ${head} refs/heads/fix/x ${'0'.repeat(40)}\n`,
      env: { TUTURUUU_PRE_PUSH: '1' },
      execFile: (command, args) => {
        if (args[0] === 'ls-files') {
          queries.push(args.slice(args.indexOf('--') + 1));
          // Nothing untracked where the change lives; drafts elsewhere.
          return args.includes('apps') && args.includes('packages')
            ? listElsewhere()
            : '';
        }
        const key = [command, ...args].join(' ');
        const match = Object.keys(answers).find((prefix) =>
          key.startsWith(prefix)
        );
        if (match === undefined) throw new Error(`unexpected command: ${key}`);
        return answers[match];
      },
      log: (line) => {
        logs.push(line);
        events.push(line);
      },
      spawn: (command, args) => {
        ran.push([command, ...args].join(' '));
        events.push('spawn');
        return { status: 0, stdout: '', stderr: '' };
      },
    });
    return { result, queries, ran, events, log: logs.join('\n') };
  };
  const NOTE = 'note: the translation checks may read untracked files';
  const drafts = () => 'apps/other/src/draft.tsx\0apps/other/notes.md\0';
  // Only the translation steps run, so no other tool is needed in the stub.
  const only = [
    '--only',
    'i18n-rendered-keys',
    '--only',
    'i18n-rendered-settings',
  ];

  const noted = run('packages/shared/src/a.ts', drafts, only);
  assert.equal(noted.result, 0);
  assert.deepEqual(noted.queries, [['packages/shared'], ['apps', 'packages']]);
  assert.ok(noted.log.includes(NOTE));
  assert.ok(noted.log.includes('"apps/other/src/draft.tsx"'));
  assert.equal(noted.log.includes('notes.md'), false);
  assert.equal(noted.log.includes('refused'), false);
  // The note comes before the first check starts, and the checks still run.
  assert.equal(noted.ran.length, 2);
  const noteAt = noted.events.findIndex((event) => event.includes(NOTE));
  assert.ok(noteAt >= 0 && noteAt < noted.events.indexOf('spawn'));

  const clean = run('packages/shared/src/a.ts', () => '', only);
  assert.equal(clean.result, 0);
  assert.equal(clean.log.includes(NOTE), false);

  // The listing is advisory: when it fails, the push is checked as usual.
  const failed = run(
    'packages/shared/src/a.ts',
    () => {
      throw new Error('stdout maxBuffer length exceeded');
    },
    only
  );
  assert.equal(failed.result, 0);
  assert.equal(failed.ran.length, 2);
  assert.equal(failed.log.includes(NOTE), false);

  // A dry run executes nothing, so it lists and notes nothing.
  const dry = run('packages/shared/src/a.ts', drafts, ['--dry-run']);
  assert.equal(dry.result, 0);
  assert.deepEqual(dry.queries, [['packages/shared']]);
  assert.equal(dry.log.includes(NOTE), false);
  assert.equal(dry.ran.length, 0);

  // Neither does a run whose translation steps were filtered out, or a
  // change that never plans them.
  const skipped = run('packages/shared/src/a.ts', drafts, [
    '--only',
    'branch-name',
  ]);
  assert.deepEqual(skipped.queries, [['packages/shared']]);
  assert.equal(skipped.log.includes(NOTE), false);
  const docs = run('apps/docs/build/example.mdx', drafts, ['--dry-run']);
  assert.equal(docs.result, 0);
  assert.equal(
    docs.queries.some((query) => query.includes('packages')),
    false
  );
});
