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
