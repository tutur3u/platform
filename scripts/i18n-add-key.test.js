const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { executeAddKey } = require('./i18n-add-key');

function createProject(t) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-add-key-'));
  t.after(() => {
    fs.rmSync(projectRoot, { force: true, recursive: true });
  });
  return projectRoot;
}

function writeJson(projectRoot, relativePath, value) {
  const filePath = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(projectRoot, relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
  );
}

function readText(projectRoot, relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function runAddKey(projectRoot, argv) {
  let stdout = '';
  let stderr = '';

  const result = executeAddKey({
    argv,
    projectRoot,
    stderr: {
      write(chunk) {
        stderr += chunk;
      },
    },
    stdout: {
      write(chunk) {
        stdout += chunk;
      },
    },
  });

  return { ...result, stderr, stdout };
}

test('adds a nested key to all locale files for an explicit app', (t) => {
  const projectRoot = createProject(t);
  writeJson(projectRoot, 'apps/web/messages/en.json', { z: 'last' });
  writeJson(projectRoot, 'apps/web/messages/vi.json', { z: 'cuối' });

  const result = runAddKey(projectRoot, [
    '--app',
    'web',
    '--key',
    'common.save',
    '--value',
    'en=Save',
    '--value',
    'vi=Lưu',
  ]);

  assert.equal(result.changedFiles.length, 2);
  assert.deepEqual(readJson(projectRoot, 'apps/web/messages/en.json'), {
    common: { save: 'Save' },
    z: 'last',
  });
  assert.deepEqual(readJson(projectRoot, 'apps/web/messages/vi.json'), {
    common: { save: 'Lưu' },
    z: 'cuối',
  });
  assert.match(
    readText(projectRoot, 'apps/web/messages/en.json'),
    /^\{\n {2}"common"/
  );
});

test('adds a key to every discovered app messages directory with arbitrary locales', (t) => {
  const projectRoot = createProject(t);
  writeJson(projectRoot, 'apps/web/messages/en.json', {});
  writeJson(projectRoot, 'apps/web/messages/fr.json', {});
  writeJson(projectRoot, 'apps/chat/messages/en.json', {});
  writeJson(projectRoot, 'apps/chat/messages/fr.json', {});

  const result = runAddKey(projectRoot, [
    '--all',
    '--key',
    'shared.title',
    '--value=en=Title',
    '--value=fr=Titre',
  ]);

  assert.deepEqual(result.targets, ['apps/chat/messages', 'apps/web/messages']);
  assert.equal(result.changedFiles.length, 4);
  assert.equal(
    readJson(projectRoot, 'apps/chat/messages/fr.json').shared.title,
    'Titre'
  );
  assert.equal(
    readJson(projectRoot, 'apps/web/messages/en.json').shared.title,
    'Title'
  );
});

test('requires values for every detected locale before writing anything', (t) => {
  const projectRoot = createProject(t);
  writeJson(projectRoot, 'apps/web/messages/en.json', {});
  writeJson(projectRoot, 'apps/web/messages/vi.json', {});

  assert.throws(
    () =>
      runAddKey(projectRoot, [
        '--app',
        'web',
        '--key',
        'common.cancel',
        '--value',
        'en=Cancel',
      ]),
    /Missing --value entries/
  );
  assert.deepEqual(readJson(projectRoot, 'apps/web/messages/en.json'), {});
  assert.deepEqual(readJson(projectRoot, 'apps/web/messages/vi.json'), {});
});

test('does not write partial changes when a key already exists without overwrite', (t) => {
  const projectRoot = createProject(t);
  writeJson(projectRoot, 'apps/web/messages/en.json', {
    common: { save: 'Save' },
  });
  writeJson(projectRoot, 'apps/web/messages/vi.json', {});

  assert.throws(
    () =>
      runAddKey(projectRoot, [
        '--app',
        'web',
        '--key',
        'common.save',
        '--value',
        'en=Save now',
        '--value',
        'vi=Lưu',
      ]),
    /already exist/
  );
  assert.deepEqual(readJson(projectRoot, 'apps/web/messages/vi.json'), {});
});

test('overwrites an existing key when requested', (t) => {
  const projectRoot = createProject(t);
  writeJson(projectRoot, 'apps/web/messages/en.json', {
    common: { save: 'Save' },
  });
  writeJson(projectRoot, 'apps/web/messages/vi.json', {
    common: { save: 'Lưu' },
  });

  runAddKey(projectRoot, [
    '--app',
    'web',
    '--key',
    'common.save',
    '--value',
    'en=Save changes',
    '--value',
    'vi=Lưu thay đổi',
    '--overwrite',
  ]);

  assert.equal(
    readJson(projectRoot, 'apps/web/messages/en.json').common.save,
    'Save changes'
  );
  assert.equal(
    readJson(projectRoot, 'apps/web/messages/vi.json').common.save,
    'Lưu thay đổi'
  );
});

test('rejects unsafe translation key segments', (t) => {
  const projectRoot = createProject(t);
  writeJson(projectRoot, 'apps/web/messages/en.json', {});

  assert.throws(
    () =>
      runAddKey(projectRoot, [
        '--app',
        'web',
        '--key',
        'common.__proto__.polluted',
        '--value',
        'en=No',
      ]),
    /not allowed/
  );
});

test('bulk adds multiple translation keys from inline entries JSON', (t) => {
  const projectRoot = createProject(t);
  writeJson(projectRoot, 'apps/web/messages/en.json', {});
  writeJson(projectRoot, 'apps/web/messages/vi.json', {});

  const result = runAddKey(projectRoot, [
    '--app',
    'web',
    '--mode',
    'add',
    '--entries',
    JSON.stringify({
      'common.cancel': { en: 'Cancel', vi: 'Hủy' },
      'common.save': { en: 'Save', vi: 'Lưu' },
    }),
  ]);

  assert.equal(result.mode, 'add');
  assert.deepEqual(result.keys, ['common.cancel', 'common.save']);
  assert.deepEqual(readJson(projectRoot, 'apps/web/messages/en.json'), {
    common: {
      cancel: 'Cancel',
      save: 'Save',
    },
  });
  assert.deepEqual(readJson(projectRoot, 'apps/web/messages/vi.json'), {
    common: {
      cancel: 'Hủy',
      save: 'Lưu',
    },
  });
});

test('bulk removes keys and prunes empty parent objects', (t) => {
  const projectRoot = createProject(t);
  writeJson(projectRoot, 'apps/web/messages/en.json', {
    common: {
      cancel: 'Cancel',
      save: 'Save',
    },
    old: {
      nested: {
        title: 'Old title',
      },
    },
  });
  writeJson(projectRoot, 'apps/web/messages/vi.json', {
    common: {
      cancel: 'Hủy',
      save: 'Lưu',
    },
    old: {
      nested: {
        title: 'Tiêu đề cũ',
      },
    },
  });

  const result = runAddKey(projectRoot, [
    '--app',
    'web',
    '--bulk-remove',
    '--entries',
    JSON.stringify(['common.cancel', 'old.nested.title']),
  ]);

  assert.equal(result.mode, 'remove');
  assert.deepEqual(readJson(projectRoot, 'apps/web/messages/en.json'), {
    common: {
      save: 'Save',
    },
  });
  assert.deepEqual(readJson(projectRoot, 'apps/web/messages/vi.json'), {
    common: {
      save: 'Lưu',
    },
  });
});

test('bulk replaces existing keys from an entries file', (t) => {
  const projectRoot = createProject(t);
  writeJson(projectRoot, 'apps/web/messages/en.json', {
    common: {
      save: 'Save',
    },
  });
  writeJson(projectRoot, 'apps/web/messages/vi.json', {
    common: {
      save: 'Lưu',
    },
  });
  writeJson(projectRoot, 'tmp/translations.json', {
    'common.save': {
      en: 'Save changes',
      vi: 'Lưu thay đổi',
    },
  });

  const result = runAddKey(projectRoot, [
    '--app',
    'web',
    '--bulk-replace',
    '--entries-file',
    'tmp/translations.json',
  ]);

  assert.equal(result.mode, 'replace');
  assert.deepEqual(readJson(projectRoot, 'apps/web/messages/en.json'), {
    common: {
      save: 'Save changes',
    },
  });
  assert.deepEqual(readJson(projectRoot, 'apps/web/messages/vi.json'), {
    common: {
      save: 'Lưu thay đổi',
    },
  });
});

test('bulk replace fails without partial writes when a key is missing', (t) => {
  const projectRoot = createProject(t);
  writeJson(projectRoot, 'apps/web/messages/en.json', {
    common: {
      save: 'Save',
    },
  });
  writeJson(projectRoot, 'apps/web/messages/vi.json', {
    common: {
      save: 'Lưu',
    },
  });

  assert.throws(
    () =>
      runAddKey(projectRoot, [
        '--app',
        'web',
        '--mode',
        'replace',
        '--entries',
        JSON.stringify({
          'common.missing': {
            en: 'Missing',
            vi: 'Thiếu',
          },
          'common.save': {
            en: 'Save changes',
            vi: 'Lưu thay đổi',
          },
        }),
      ]),
    /Translation key\(s\) are missing/
  );

  assert.deepEqual(readJson(projectRoot, 'apps/web/messages/en.json'), {
    common: {
      save: 'Save',
    },
  });
  assert.deepEqual(readJson(projectRoot, 'apps/web/messages/vi.json'), {
    common: {
      save: 'Lưu',
    },
  });
});

test('bulk remove can skip missing keys when requested', (t) => {
  const projectRoot = createProject(t);
  writeJson(projectRoot, 'apps/web/messages/en.json', {
    common: {
      save: 'Save',
    },
  });
  writeJson(projectRoot, 'apps/web/messages/vi.json', {
    common: {
      save: 'Lưu',
    },
  });

  const result = runAddKey(projectRoot, [
    '--app',
    'web',
    '--mode',
    'remove',
    '--ignore-missing',
    '--entries',
    JSON.stringify(['common.cancel']),
  ]);

  assert.equal(result.changedFiles.length, 0);
  assert.deepEqual(readJson(projectRoot, 'apps/web/messages/en.json'), {
    common: {
      save: 'Save',
    },
  });
});
