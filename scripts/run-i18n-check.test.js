const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createLogBuffer,
  findInvalidKeys,
  findMissingKeys,
  flattenTranslations,
  normalizeI18nextKey,
  parseArgs,
  runFallbackCheck,
} = require('./run-i18n-check.js');

function createTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'run-i18n-check-'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

test('parseArgs captures repeated locales, checks, and ignored keys', () => {
  const parsed = parseArgs([
    '-l',
    'apps/web/messages',
    'apps/tasks/messages',
    '-s',
    'en',
    '-f',
    'i18next',
    '-o',
    'missingKeys',
    'invalidKeys',
    '-i',
    'foo.bar',
    'foo.baz.*',
  ]);

  assert.deepEqual(parsed, {
    format: 'i18next',
    ignore: ['foo.bar', 'foo.baz.*'],
    locales: ['apps/web/messages', 'apps/tasks/messages'],
    only: ['missingKeys', 'invalidKeys'],
    source: 'en',
  });
});

test('flattenTranslations and missing-key detection respect i18next plural suffixes', () => {
  const source = flattenTranslations({
    tasks: {
      count_one: '{{count}} task',
      count_other: '{{count}} tasks',
      title: 'Title',
    },
  });
  const target = flattenTranslations({
    tasks: {
      count_other: '{{count}} tasks',
    },
  });

  assert.equal(normalizeI18nextKey('tasks.count_one'), 'tasks.count');
  assert.deepEqual(findMissingKeys(source, target, []), ['tasks.title']);
});

test('findInvalidKeys detects interpolation and tag regressions', () => {
  const source = {
    greeting: 'Hello {{name}}',
    rich: '<strong>{{count}}</strong>',
  };
  const target = {
    greeting: 'Hello {{person}}',
    rich: '<em>{{count}}</em>',
  };

  assert.deepEqual(findInvalidKeys(source, target, []), [
    {
      key: 'greeting',
      message:
        'Interpolation or markup tokens differ from the source translation',
    },
    {
      key: 'rich',
      message:
        'Interpolation or markup tokens differ from the source translation',
    },
  ]);
});

test('runFallbackCheck succeeds for matching locale trees', () => {
  const projectRoot = createTempProject();
  writeJson(path.join(projectRoot, 'apps/web/messages/en/common.json'), {
    greeting: 'Hello {{name}}',
    rich: '<strong>{{count}}</strong>',
  });
  writeJson(path.join(projectRoot, 'apps/web/messages/vi/common.json'), {
    greeting: 'Xin chao {{name}}',
    rich: '<strong>{{count}}</strong>',
  });

  const stdout = createLogBuffer();
  const stderr = createLogBuffer();

  const exitCode = runFallbackCheck({
    argv: [
      '-l',
      'apps/web/messages',
      '-s',
      'en',
      '-f',
      'i18next',
      '-o',
      'missingKeys',
      'invalidKeys',
    ],
    projectRoot,
    stdout: (line) => stdout.write(line),
    stderr: (line) => stderr.write(line),
    now: () => 1000,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.lines.length, 0);
  assert.ok(stdout.lines.includes('No missing keys found!'));
  assert.ok(stdout.lines.includes('No invalid translations found!'));
});

test('runFallbackCheck reports missing keys but honors ignored wildcard paths', () => {
  const projectRoot = createTempProject();
  writeJson(path.join(projectRoot, 'apps/web/messages/en/common.json'), {
    billing: {
      paid: 'Paid',
      draft: 'Draft',
    },
    navigation: {
      home: 'Home',
    },
  });
  writeJson(path.join(projectRoot, 'apps/web/messages/vi/common.json'), {
    billing: {
      draft: 'Ban nhap',
    },
  });

  const stdout = createLogBuffer();
  const stderr = createLogBuffer();

  const exitCode = runFallbackCheck({
    argv: [
      '-l',
      'apps/web/messages',
      '-s',
      'en',
      '-f',
      'i18next',
      '-o',
      'missingKeys',
      '-i',
      'billing.*',
    ],
    projectRoot,
    stdout: (line) => stdout.write(line),
    stderr: (line) => stderr.write(line),
    now: () => 2000,
  });

  assert.equal(exitCode, 1);
  assert.equal(stderr.lines.length, 0);
  assert.ok(stdout.lines.includes('Found missing keys!'));
  assert.ok(stdout.lines.includes('- navigation.home'));
  assert.equal(stdout.lines.includes('- billing.paid'), false);
});
