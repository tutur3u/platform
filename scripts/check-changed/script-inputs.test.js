const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { main } = require('../check-changed.js');

for (const [testFile, helperFile] of [
  ['scripts/x.test.js', 'scripts/helper.js'],
  ['scripts/ci/x.test.js', 'scripts/helper.js'],
  ['plugins/tool/scripts/x.test.js', 'plugins/helper.js'],
  ['.github/actions/tool/x.test.js', '.github/actions/helper.js'],
]) {
  test(`hook refuses untracked ${helperFile} required by committed ${testFile}`, (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-script-inputs-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const git = (...args) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    git('init', '-q');
    git('config', 'user.name', 'Gate fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    git(
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-qm',
      'base',
      '--allow-empty'
    );
    const base = git('rev-parse', 'HEAD');
    fs.mkdirSync(path.dirname(path.join(root, testFile)), { recursive: true });
    const relative = path.posix.relative(
      path.posix.dirname(testFile),
      helperFile
    );
    fs.writeFileSync(
      path.join(root, testFile),
      `require(${JSON.stringify(relative.startsWith('.') ? relative : `./${relative}`)});\n`
    );
    git('add', testFile);
    git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'script');
    const head = git('rev-parse', 'HEAD');
    fs.writeFileSync(path.join(root, helperFile), 'module.exports = true;\n');
    const logs = [];
    const queries = [];
    let executions = 0;
    const deps = {
      root,
      env: { TUTURUUU_PRE_PUSH: '1' },
      stdin: `refs/heads/test ${head} refs/heads/test ${'0'.repeat(40)}\n`,
      execFile: (command, args, options) => {
        if (args[0] === 'ls-files') queries.push(args);
        return execFileSync(command, args, { ...options, cwd: root });
      },
      log: (line) => logs.push(line),
      spawn: () => {
        executions++;
        return { status: 0, stdout: '' };
      },
    };
    assert.equal(
      main(
        ['--hook', '--base', base, '--no-ttr', '--only', 'script-tests'],
        deps
      ),
      1
    );
    assert.equal(executions, 0);
    assert.ok(logs.join('\n').includes(helperFile));
    assert.ok(
      queries.some((args) => args.includes(path.posix.dirname(helperFile)))
    );

    // Skipping script tests must not claim to validate their helper closure.
    assert.equal(
      main(
        [
          '--hook',
          '--base',
          base,
          '--no-ttr',
          '--dry-run',
          '--skip',
          'script-tests',
        ],
        deps
      ),
      0
    );
    fs.unlinkSync(path.join(root, helperFile));
    assert.equal(
      main(
        [
          '--hook',
          '--base',
          base,
          '--no-ttr',
          '--dry-run',
          '--only',
          'script-tests',
        ],
        deps
      ),
      0
    );
  });
}
