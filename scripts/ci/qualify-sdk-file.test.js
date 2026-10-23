const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { privateTempDirSync } = require('../safe-fs');
const { readPackage } = require('./qualify-sdk-file');

test('qualification file rejections retain the boundary blocker code', (t) => {
  const root = privateTempDirSync('qualification-errors-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'archive.tgz');
  fs.writeFileSync(file, 'bytes', { flag: 'wx' });
  for (const code of ['PACKAGE_LIMIT', 'PACK_FAILED']) {
    assert.throws(() => readPackage(file, 1, code), { code });
    assert.throws(() => readPackage(root, 20, code), { code });
    if (process.platform !== 'win32') {
      const link = path.join(root, `${code}.tgz`);
      fs.symlinkSync(file, link);
      assert.throws(() => readPackage(link, 20, code), { code });
    }
  }
  assert.equal(readPackage(file, 5, 'PACK_FAILED').toString(), 'bytes');
  assert.throws(
    () => readPackage(path.join(root, 'missing'), 5, 'PACK_FAILED'),
    {
      code: 'ENOENT',
    }
  );
});
