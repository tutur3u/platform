const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { trustedTtr } = require('./trusted-ttr');

function fixture(t, orphan = false) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'trusted-ttr-'))
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'user');
  const ancestor = path.join(root, 'ancestor');
  const worktree = path.join(ancestor, '.worktrees/child');
  const bin = path.join(ancestor, 'node_modules/.bin');
  const pkg = path.join(home, '.bun/install/global/node_modules/tuturuuu');
  const index = path.join(pkg, 'dist/cli/index.js');
  const launcher = path.join(root, 'resource-launcher');
  const observed = path.join(root, 'global-calls');
  for (const dir of [
    bin,
    worktree,
    path.dirname(index),
    path.join(home, '.bun/bin'),
  ])
    fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(launcher, 'trusted bytes');
  const legacy = path.join(ancestor, 'legacy.js');
  fs.writeFileSync(
    legacy,
    `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(launcher)},'legacy overwrite');process.stdout.write('{"installed":true,"enabled":true}');`,
    { mode: 0o700 }
  );
  if (orphan) fs.symlinkSync(legacy, path.join(bin, 'ttr'));
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({
      name: 'tuturuuu',
      version: '0.28.0',
      bin: { ttr: './dist/cli/index.js' },
    })
  );
  fs.writeFileSync(
    index,
    `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(observed)},JSON.stringify(process.argv.slice(2))+'\\n');const args=process.argv.slice(2);if(args[1]==='status')process.stdout.write('{"installed":true,"enabled":true}');else {const cp=require('node:child_process');const cmd=args.slice(args.indexOf('--')+1);if(cmd.length)process.exitCode=cp.spawnSync(cmd[0],cmd.slice(1),{stdio:'inherit'}).status;}`,
    { mode: 0o700 }
  );
  const cli = path.join(home, '.bun/bin/ttr');
  fs.symlinkSync(index, cli);
  const env = {
    ...process.env,
    HOME: home,
    PATH: `${bin}:${process.env.PATH}`,
    TTR_RESOURCES_ADMITTED: '',
    TTR_RESOURCE_OWNER: '',
  };
  return { root, home, worktree, pkg, cli, legacy, launcher, observed, env };
}

for (const relative of ['.bun', '.bun/install']) {
  test(`canonicalises a symlinked ${relative} install base and rejects escapes`, (t) => {
    const f = fixture(t);
    const base = path.join(f.home, relative);
    const target = path.join(f.root, 'relocated-install');
    fs.renameSync(base, target);
    fs.symlinkSync(target, base, 'dir');
    const script = path.join(__dirname, 'trusted-ttr.js');
    const resolve = () =>
      execFileSync(
        process.execPath,
        [
          '-p',
          `require(${JSON.stringify(script)}).trustedTtr(${JSON.stringify(f.home)},${JSON.stringify(f.root)})`,
        ],
        { cwd: f.root, env: f.env, encoding: 'utf8', stdio: 'pipe' }
      ).trim();
    assert.equal(resolve(), f.cli);
    assert.equal(fs.existsSync(f.observed), false);
    fs.unlinkSync(f.cli);
    fs.symlinkSync(f.legacy, f.cli);
    assert.throws(
      resolve,
      (error) =>
        error &&
        typeof error === 'object' &&
        'stderr' in error &&
        /outside the global installation/.test(String(error.stderr))
    );
    assert.equal(fs.readFileSync(f.launcher, 'utf8'), 'trusted bytes');
  });
}

test('ancestor workspace binary is refused from a worktree without node_modules', (t) => {
  const f = fixture(t, true);
  assert.equal(fs.existsSync(path.join(f.worktree, 'node_modules')), false);
  const checker = path.join(__dirname, 'check-changed.js');
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [
          '-e',
          `const cp=require('node:child_process');require(${JSON.stringify(checker)}).ttrPrefix(true,cp.execFileSync);`,
        ],
        { cwd: f.worktree, env: f.env, stdio: 'pipe' }
      ),
    (error) => /Unsafe ancestor ttr bin/.test(error.stderr.toString())
  );
  assert.equal(fs.readFileSync(f.launcher, 'utf8'), 'trusted bytes');
  assert.equal(fs.existsSync(f.observed), false);
});

test('fixture cwd isolates resolution while the default still refuses stale ancestor bins', (t) => {
  const f = fixture(t, true);
  const resolver = path.join(__dirname, 'trusted-ttr.js');
  const run = (cwdArgument) =>
    execFileSync(
      process.execPath,
      [
        '-p',
        `require(${JSON.stringify(resolver)}).trustedTtr(${JSON.stringify(f.home)}${cwdArgument})`,
      ],
      { cwd: f.worktree, env: f.env, encoding: 'utf8', stdio: 'pipe' }
    ).trim();
  assert.equal(run(`,${JSON.stringify(f.root)}`), f.cli);
  assert.throws(run.bind(null, ''), (error) =>
    /Unsafe ancestor ttr bin links/.test(String(error.stderr))
  );
  assert.equal(fs.readFileSync(f.launcher, 'utf8'), 'trusted bytes');
  assert.equal(fs.existsSync(f.observed), false);
});

test('missing, legacy and redirected global installations refuse with recovery instructions', (t) => {
  const f = fixture(t);
  fs.writeFileSync(
    path.join(f.pkg, 'package.json'),
    JSON.stringify({ name: 'tuturuuu', version: '0.27.0' })
  );
  assert.throws(
    () => trustedTtr(f.home, f.root),
    /bun add -g tuturuuu.*0\.28\.0/
  );
  fs.unlinkSync(f.cli);
  fs.symlinkSync(f.legacy, f.cli);
  assert.throws(
    () => trustedTtr(f.home, f.root),
    /outside the global installation.*bun add -g tuturuuu/
  );
  fs.unlinkSync(f.cli);
  assert.throws(
    () => trustedTtr(f.home, f.root),
    /Trusted global ttr unavailable at .*Run bun add -g tuturuuu to install/
  );
  assert.equal(fs.existsSync(f.observed), false);
});

test('package scripts and shared wrapper preserve arguments and skip inherited lane admission', (t) => {
  const f = fixture(t);
  const leaf = path.join(f.worktree, 'leaf.cjs');
  fs.writeFileSync(
    leaf,
    'process.stdout.write(JSON.stringify(process.argv.slice(2)));process.exitCode=7;'
  );
  const wrapper = path.join(__dirname, 'ttr-run.js');
  const scripts = [
    wrapper,
    ...['../package.json', '../packages/sdk/package.json'].map((name) => {
      const file = path.resolve(__dirname, name);
      return path.resolve(
        path.dirname(file),
        JSON.parse(fs.readFileSync(file)).scripts.ttr.split(' ')[1]
      );
    }),
  ];
  for (const marker of ['', 'TTR_RESOURCES_ADMITTED', 'TTR_RESOURCE_OWNER']) {
    for (const script of scripts) {
      const args = script === wrapper ? ['--'] : ['resources', 'run', '--'];
      try {
        execFileSync(
          process.execPath,
          [script, ...args, process.execPath, leaf, 'a b', '--flag'],
          {
            cwd: f.worktree,
            env: { ...f.env, ...(marker ? { [marker]: 'lane-token' } : {}) },
          }
        );
        assert.fail('must preserve child failure');
      } catch (error) {
        assert.equal(error.status, 7);
        assert.equal(error.stdout.toString(), '["a b","--flag"]');
      }
    }
  }
  assert.equal(
    fs.readFileSync(f.observed, 'utf8').trim().split('\n').length,
    3
  );
});

test('committed package scripts use the shared wrapper for resource admission', () => {
  const repo = path.resolve(__dirname, '..');
  const files = execFileSync(
    'git',
    [
      'ls-files',
      '--',
      'apps/**/package.json',
      'packages/**/package.json',
      'scripts/**/package.json',
    ],
    { cwd: repo, encoding: 'utf8' }
  )
    .trim()
    .split('\n');
  for (const file of files.filter(Boolean)) {
    const scripts =
      JSON.parse(fs.readFileSync(path.join(repo, file))).scripts ?? {};
    for (const [name, command] of Object.entries(scripts))
      assert.doesNotMatch(
        command,
        /\b(?:ttr|tuturuuu|tutur3u)\s+resources\s+run\b/,
        `${file}#${name}: use node <relative>/scripts/ttr-run.js --`
      );
  }
});

test('nested changed-file admission skips even the global status probe', (t) => {
  const f = fixture(t);
  const checker = path.join(__dirname, 'check-changed.js');
  for (const marker of ['TTR_RESOURCES_ADMITTED', 'TTR_RESOURCE_OWNER']) {
    execFileSync(
      process.execPath,
      [
        '-e',
        `const cp=require('node:child_process');if(require(${JSON.stringify(checker)}).ttrPrefix(true,cp.execFileSync)!==null)throw Error('nested admission attempted');`,
      ],
      { cwd: f.worktree, env: { ...f.env, [marker]: 'inherited-token' } }
    );
  }
  assert.equal(fs.existsSync(f.observed), false);
});

test('trusted resolver accepts the published wrapper entry declared by a new global version', (t) => {
  const f = fixture(t);
  const bin = path.join(f.pkg, 'bin/ttr.cjs');
  fs.mkdirSync(path.dirname(bin));
  fs.copyFileSync(path.join(f.pkg, 'dist/cli/index.js'), bin);
  fs.writeFileSync(
    path.join(f.pkg, 'package.json'),
    JSON.stringify({
      name: 'tuturuuu',
      version: '0.29.0',
      bin: { ttr: './bin/ttr.cjs' },
    })
  );
  fs.unlinkSync(f.cli);
  fs.symlinkSync(bin, f.cli);
  assert.equal(trustedTtr(f.home, f.root), f.cli);
});

test('symlinked HOME resolves the same trusted global CLI', (t) => {
  const f = fixture(t);
  const alias = path.join(f.root, 'home-link');
  fs.symlinkSync(f.home, alias, 'dir');
  assert.equal(
    trustedTtr(alias, f.root),
    fs.realpathSync(path.dirname(f.cli)) + '/ttr'
  );
});
