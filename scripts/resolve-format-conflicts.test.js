const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolve } = require('./resolve-format-conflicts');
function fixture(t, incoming = "export const value = 'base';\n", texts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oxc-conflict-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    cp.execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  git('init', '-b', 'main');
  fs.symlinkSync(
    path.resolve(__dirname, '../node_modules'),
    path.join(root, 'node_modules')
  );
  fs.copyFileSync(
    path.resolve(__dirname, '../.oxfmtrc.json'),
    path.join(root, '.oxfmtrc.json')
  );
  const selected = texts.file ?? 'example.js';
  const file = path.join(root, selected);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, texts.base ?? 'export const value="base"\n');
  git('add', selected);
  git('commit', '-m', 'base');
  git('checkout', '-b', 'pr');
  fs.writeFileSync(file, texts.feature ?? 'export const value="feature"\n');
  git('commit', '-am', 'feature');
  git('checkout', 'main');
  fs.writeFileSync(file, incoming);
  git('commit', '-am', 'main');
  git('checkout', 'pr');
  assert.throws(() => git('merge', 'main'));
  return { root: fs.realpathSync(root), git, file };
}
test('real stages: dry run preserves bytes, apply retains PR behavior and index', (t) => {
  const { root, git, file } = fixture(t);
  const original = fs.readFileSync(file, 'utf8');
  const stages = git('ls-files', '-u');
  assert.deepEqual(resolve({ root, main: 'main' }), ['example.js']);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  resolve({ root, main: 'main', apply: true });
  assert.equal(
    fs.readFileSync(file, 'utf8'),
    "export const value = 'feature';\n"
  );
  assert.equal(git('ls-files', '-u'), stages);
});
test('semantic main change refuses without writing', (t) => {
  const { root, file } = fixture(t, "export const value = 'different';\n");
  const original = fs.readFileSync(file, 'utf8');
  assert.throws(() => resolve({ root, main: 'main', apply: true }), /Semantic/);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});
test('manual edits and wrong incoming refs refuse', (t) => {
  const { root, file } = fixture(t);
  fs.appendFileSync(file, '// manual work\n');
  assert.throws(
    () => resolve({ root, main: 'main', apply: true }),
    /Manually edited/
  );
  assert.throws(() => resolve({ root, main: 'HEAD' }), /MERGE_HEAD/);
});
for (const kind of ['delete', 'symlink', 'binary'])
  test(`${kind} conflict refuses`, (t) => {
    const { root, git, file } = fixture(t);
    if (kind === 'delete') {
      const stages = git('ls-files', '-u').trim().split('\n');
      const oid = stages[0].split(' ')[1];
      cp.execFileSync('git', ['update-index', '--index-info'], {
        cwd: root,
        input: `0 ${oid}\texample.js\n${stages.filter((line) => !line.includes(' 3\t')).join('\n')}\n`,
      });
    }
    if (kind === 'symlink') {
      fs.unlinkSync(file);
      fs.symlinkSync('.oxfmtrc.json', file);
    }
    if (kind === 'binary') fs.appendFileSync(file, '\0');
    assert.throws(() => resolve({ root, main: 'main', apply: true }));
  });

test('add/add stages refuse before writes', (t) => {
  const { root, git, file } = fixture(t);
  const stages = git('ls-files', '-u').trim().split('\n');
  cp.execFileSync('git', ['update-index', '--index-info'], {
    cwd: root,
    input: `0 ${stages[0].split(' ')[1]}\texample.js\n${stages.filter((line) => !line.includes(' 1\t')).join('\n')}\n`,
  });
  const original = fs.readFileSync(file, 'utf8');
  assert.throws(
    () => resolve({ root, main: 'main', apply: true }),
    /Add\/delete\/rename/
  );
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});

test('multiple formatting-only conflict hunks retain both PR edits', (t) => {
  const middle = Array.from(
    { length: 12 },
    (_, i) => `export const gap${i} = ${i};\n`
  ).join('');
  const base =
    'export const first="base"\n' + middle + 'export const last="base"\n';
  const feature = base.replaceAll('"base"', '"feature"');
  const main =
    "export const first = 'base';\n" + middle + "export const last = 'base';\n";
  const { root, file } = fixture(t, main, { base, feature });
  resolve({ root, main: 'main', apply: true });
  const output = fs.readFileSync(file, 'utf8');
  assert.ok(output.includes("export const first = 'feature';"));
  assert.ok(output.includes("export const last = 'feature';"));
});

for (const swap of ['leaf', 'parent', 'regular']) {
  test(`refuses ${swap} replacement after validation without touching outside sentinel`, (t) => {
    const { root, git, file } = fixture(t, undefined, {
      file: 'src/example.js',
    });
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'oxc-outside-'));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    const sentinel = path.join(outside, 'example.js');
    const original = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(sentinel, original);
    const index = git('ls-files', '-u');
    const spawn = cp.spawnSync;
    let swapped = false;
    t.mock.method(cp, 'spawnSync', (...args) => {
      const result = spawn(...args);
      if (!swapped && String(args[0]).endsWith('/oxfmt')) {
        swapped = true;
        if (swap === 'parent') {
          fs.renameSync(path.dirname(file), path.join(root, 'retained-src'));
          fs.symlinkSync(outside, path.dirname(file));
        } else {
          fs.renameSync(file, path.join(root, 'retained.js'));
          if (swap === 'leaf') fs.symlinkSync(sentinel, file);
          else fs.writeFileSync(file, original);
        }
      }
      return result;
    });
    assert.throws(
      () => resolve({ root, main: 'main', apply: true }),
      /replaced|unsafe|outside/
    );
    assert.ok(swapped);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), original);
    assert.equal(
      fs.readFileSync(
        swap === 'parent'
          ? path.join(root, 'retained-src/example.js')
          : path.join(root, 'retained.js'),
        'utf8'
      ),
      original
    );
    assert.equal(git('ls-files', '-u'), index);
  });
}

test('opening a selected hard link refuses without changing outside content', (t) => {
  const { root, file } = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'oxc-outside-link-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const sentinel = path.join(outside, 'sentinel.js');
  const original = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(sentinel, original);
  fs.unlinkSync(file);
  fs.linkSync(sentinel, file);
  assert.throws(() => resolve({ root, main: 'main', apply: true }), /unsafe/);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), original);
});

test('a selected directory refuses before any content access', (t) => {
  const { root, file } = fixture(t);
  fs.unlinkSync(file);
  fs.mkdirSync(file);
  assert.throws(
    () => resolve({ root, main: 'main', apply: true }),
    /EISDIR|Non-regular/
  );
  assert.ok(fs.statSync(file).isDirectory());
});
