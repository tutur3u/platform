const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const checkerPath = path.join(__dirname, 'i18n-namespace-check.js');

function createProject(t) {
  const projectRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'i18n-namespace-check-')
  );
  t.after(() => {
    fs.rmSync(projectRoot, { force: true, recursive: true });
  });
  return projectRoot;
}

function writeFile(projectRoot, relativePath, content) {
  const filePath = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeJson(projectRoot, relativePath, value) {
  writeFile(projectRoot, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeSharedUiApp(projectRoot, appDir, messages) {
  writeJson(projectRoot, `${appDir}/messages/en.json`, messages);
  writeJson(projectRoot, `${appDir}/package.json`, {
    dependencies: {
      '@tuturuuu/ui': 'workspace:*',
    },
  });
}

test('namespace checker reports missing scoped ws-task-boards share keys', (t) => {
  const projectRoot = createProject(t);

  writeFile(
    projectRoot,
    'packages/ui/src/board-share-dialog.tsx',
    `
      import { useTranslations } from 'next-intl';

      export function BoardShareDialog() {
        const t = useTranslations();
        return <span>{t('ws-task-boards.share.title')}</span>;
      }
    `
  );

  writeSharedUiApp(projectRoot, 'apps/web', {
    'ws-task-boards': {
      share: {
        title: 'Share board',
      },
    },
  });
  writeSharedUiApp(projectRoot, 'apps/tasks', {
    'ws-task-boards': {},
  });

  const result = spawnSync(process.execPath, [checkerPath], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /apps\/tasks: MISSING 1 translation key/u);
  assert.match(result.stdout, /ws-task-boards\.share\.title/u);
});

test('namespace checker reports workspace settings keys used by typed helpers', (t) => {
  const projectRoot = createProject(t);

  writeFile(
    projectRoot,
    'packages/ui/src/workspace-access-labels.ts',
    `
      export function getWorkspaceAccessLabels(
        t: (key: string) => string
      ) {
        return { empty: t('ws-members.no_roles_found') };
      }
    `
  );

  writeSharedUiApp(projectRoot, 'apps/tasks', {
    'ws-members': {},
  });

  const result = spawnSync(process.execPath, [checkerPath], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /apps\/tasks: MISSING 1 translation key/u);
  assert.match(result.stdout, /ws-members\.no_roles_found/u);
});

test('namespace checker reports shared settings calendar keys missing from tasks', (t) => {
  const projectRoot = createProject(t);

  writeFile(
    projectRoot,
    'packages/ui/src/lunar-calendar-settings.tsx',
    `
      import { useTranslations } from 'next-intl';

      export function LunarCalendarSettings() {
        const t = useTranslations('settings.calendar');
        return <span>{t('show_lunar_calendar')}</span>;
      }
    `
  );

  writeSharedUiApp(projectRoot, 'apps/tasks', {
    settings: {
      calendar: {
        title: 'Calendar',
      },
    },
  });

  const result = spawnSync(process.execPath, [checkerPath], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /apps\/tasks: MISSING 1 translation key/u);
  assert.match(result.stdout, /settings\.calendar\.show_lunar_calendar/u);
});

test('tasks calendar settings keys are not hidden by config exceptions', () => {
  const config = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, 'i18n-namespace-check.config.json'),
      'utf8'
    )
  );

  assert.ok(
    !config.keyExceptions?.['apps/tasks']?.includes('settings.calendar.*')
  );
});

test('namespace checker scopes task UI translations to direct consumers', (t) => {
  const projectRoot = createProject(t);

  writeFile(
    projectRoot,
    'packages/tasks-ui/src/task-progress-page.tsx',
    `
      import { useTranslations } from 'next-intl';

      export function TaskProgressPage() {
        const t = useTranslations('task-progress');
        return <span>{t('summary.title')}</span>;
      }
    `
  );

  writeJson(projectRoot, 'apps/tasks/messages/en.json', {
    'task-progress': {},
  });
  writeJson(projectRoot, 'apps/tasks/package.json', {
    dependencies: {
      '@tuturuuu/tasks-ui': 'workspace:*',
    },
  });
  writeSharedUiApp(projectRoot, 'apps/web', { common: {} });

  const result = spawnSync(process.execPath, [checkerPath], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /apps\/tasks: MISSING 1 translation key/u);
  assert.match(result.stdout, /task-progress\.summary\.title/u);
  assert.doesNotMatch(result.stdout, /apps\/web: MISSING.*task-progress/u);
});

// An app registered with an empty shared-package scope has no shared namespace
// check, so the claim behind the scope is asserted here: nothing it imports
// from a shared package, directly or transitively, imports next-intl. A
// specifier the walk cannot resolve fails the test instead of being skipped.
const IMPORT_SPECIFIER = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/gu;

function sharedModulesOf(appSource) {
  const root = path.join(__dirname, '..');
  const { SHARED_PACKAGES } = require('./i18n-namespace-apps');
  const packages = SHARED_PACKAGES.map(({ name }) => {
    const dir = path.join(root, name);
    const manifest = require(path.join(dir, 'package.json'));
    return { dir, exportsMap: manifest.exports ?? {}, name: manifest.name };
  });
  const targetOf = (entry) =>
    typeof entry === 'string' ? entry : (entry.import ?? entry.default);
  const existing = (base) =>
    ['', '.tsx', '.ts', '/index.tsx', '/index.ts']
      .map((suffix) => `${base}${suffix}`)
      .find((file) => fs.existsSync(file) && fs.statSync(file).isFile());
  const resolveExport = ({ dir, exportsMap }, subpath) => {
    const exact = exportsMap[subpath ? `./${subpath}` : '.'];
    if (exact) return existing(path.join(dir, targetOf(exact)));
    for (const [key, entry] of Object.entries(exportsMap)) {
      const [head, tail] = key.slice(2).split('*');
      if (tail === undefined || !subpath.startsWith(head)) continue;
      if (!subpath.endsWith(tail)) continue;
      const middle = subpath.slice(head.length, subpath.length - tail.length);
      const file = existing(
        path.join(dir, targetOf(entry).replaceAll('*', middle))
      );
      if (file) return file;
    }
    return undefined;
  };
  const sharedPackageOf = (specifier) =>
    packages.find(
      ({ name }) => specifier === name || specifier.startsWith(`${name}/`)
    );
  const importsOf = (file) =>
    [...fs.readFileSync(file, 'utf8').matchAll(IMPORT_SPECIFIER)].map(
      (match) => match[1]
    );
  const sourceFiles = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(file);
      return /\.tsx?$/u.test(entry.name) ? [file] : [];
    });

  const modules = new Set();
  const unresolved = [];
  const follow = (specifier, from, relative) => {
    const shared = sharedPackageOf(specifier);
    if (!shared && !(relative && specifier.startsWith('.'))) return;
    const file = shared
      ? resolveExport(shared, specifier.slice(shared.name.length + 1))
      : existing(path.resolve(path.dirname(from), specifier));
    if (!file) {
      unresolved.push(`${specifier} from ${path.relative(root, from)}`);
      return;
    }
    if (modules.has(file)) return;
    modules.add(file);
    if (!/\.tsx?$/u.test(file)) return;
    for (const next of importsOf(file)) follow(next, file, true);
  };
  for (const file of sourceFiles(appSource))
    for (const specifier of importsOf(file)) follow(specifier, file, false);
  return {
    modules: [...modules].map((file) => path.relative(root, file)),
    unresolved,
  };
}

test('apps with an empty shared-package scope import only namespace-free shared UI', () => {
  const { APP_SHARED_PACKAGE_SCOPES } = require('./i18n-namespace-policy');
  const { APPS } = require('./i18n-namespace-apps');
  const unscoped = APPS.filter(
    (app) => APP_SHARED_PACKAGE_SCOPES.get(app.name)?.size === 0
  );
  assert.ok(unscoped.some((app) => app.name === 'apps/mastermind'));

  for (const app of unscoped) {
    const { modules, unresolved } = sharedModulesOf(
      path.join(__dirname, '..', app.dir, 'src')
    );
    assert.ok(modules.length > 0, `${app.name} imports no shared UI`);
    assert.deepEqual(unresolved, [], `${app.name} has unresolved imports`);
    const readers = modules.filter((file) =>
      [
        ...fs
          .readFileSync(path.join(__dirname, '..', file), 'utf8')
          .matchAll(IMPORT_SPECIFIER),
      ].some((match) => /^next-intl(?:\/|$)/u.test(match[1]))
    );
    assert.deepEqual(readers, [], `${app.name} reaches translated shared UI`);
  }
});
