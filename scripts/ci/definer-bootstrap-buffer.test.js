const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('trusted definer bootstrap reads a complete baseline larger than 1 MiB', (t) => {
  const workflow = fs.readFileSync(
    path.resolve(__dirname, '../../.github/workflows/security-checks.yaml'),
    'utf8'
  );
  const line = workflow
    .split('\n')
    .map((value) => value.trim())
    .find((value) =>
      value.startsWith("const git = (args) => execFileSync('git', args,")
    );
  assert.ok(line, 'trusted bootstrap Git reader exists');
  const git = vm.runInNewContext(`${line}; git`, { execFileSync });
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'definer-bootstrap-buffer-')
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  const source = `${'x'.repeat(2 * 1024 * 1024)}\n`;
  const blob = execFileSync(
    'git',
    ['-C', root, 'hash-object', '-w', '--stdin'],
    {
      input: source,
      encoding: 'utf8',
    }
  ).trim();
  assert.equal(git(['-C', root, 'show', blob]), source);
});
