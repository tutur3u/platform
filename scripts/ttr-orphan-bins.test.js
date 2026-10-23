const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('orphan SDK aliases without a root dependency are refused even inside an admitted lane', (t) => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'ttr-orphan-bins-'))
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, '.worktrees/child');
  const sdk = path.join(root, 'packages/sdk');
  const bin = path.join(root, 'node_modules/.bin');
  const marker = path.join(root, 'stale-executed');
  for (const dir of [workspace, path.join(sdk, 'dist/cli'), bin])
    fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'monorepo',
      private: true,
      workspaces: ['packages/*'],
    })
  );
  fs.writeFileSync(
    path.join(sdk, 'package.json'),
    JSON.stringify({ name: 'tuturuuu', version: '0.28.0' })
  );
  fs.writeFileSync(
    path.join(sdk, 'dist/cli/index.js'),
    `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)},'stale ran');`,
    { mode: 0o700 }
  );
  fs.symlinkSync('../packages/sdk', path.join(root, 'node_modules/tuturuuu'));
  for (const alias of ['ttr', 'tuturuuu', 'tutur3u'])
    fs.symlinkSync('../tuturuuu/dist/cli/index.js', path.join(bin, alias));
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).dependencies,
    undefined
  );
  assert.equal(fs.existsSync(path.join(workspace, 'node_modules')), false);
  const globalPackage = path.join(
    root,
    '.bun/install/global/node_modules/tuturuuu'
  );
  fs.mkdirSync(path.join(globalPackage, 'dist/cli'), { recursive: true });
  fs.mkdirSync(path.join(root, '.bun/bin'), { recursive: true });
  const globalProbe = path.join(root, 'global-probed');
  fs.writeFileSync(
    path.join(globalPackage, 'package.json'),
    JSON.stringify({
      name: 'tuturuuu',
      version: '0.28.0',
      bin: { ttr: './dist/cli/index.js' },
    })
  );
  const globalEntry = path.join(globalPackage, 'dist/cli/index.js');
  fs.writeFileSync(
    globalEntry,
    `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(globalProbe)},'probed');process.stdout.write('{"installed":true,"enabled":true}');`,
    { mode: 0o700 }
  );
  fs.symlinkSync(globalEntry, path.join(root, '.bun/bin/ttr'));
  const trusted = path.join(__dirname, 'trusted-ttr.js');
  const checker = path.join(__dirname, 'check-changed.js');
  const env = {
    ...process.env,
    HOME: root,
    PATH: bin + ':' + process.env.PATH,
    TTR_RESOURCES_ADMITTED: '',
    TTR_RESOURCE_OWNER: '',
  };
  for (const nested of [false, true]) {
    const inherited = {
      ...env,
      ...(nested ? { TTR_RESOURCES_ADMITTED: 'live-lane' } : {}),
    };
    for (const [command, args] of [
      [process.execPath, [trusted, 'resources', 'status', '--json']],
      [
        process.execPath,
        [
          '-e',
          `require(${JSON.stringify(checker)}).ttrPrefix(true,require('node:child_process').execFileSync);`,
        ],
      ],
    ])
      assert.throws(
        () =>
          execFileSync(command, args, {
            cwd: workspace,
            env: inherited,
            stdio: 'pipe',
          }),
        (error) =>
          /Unsafe ancestor ttr bin links/.test(error.stderr.toString()) &&
          /bun install alone may leave orphans/.test(error.stderr.toString())
      );
  }
  assert.equal(fs.existsSync(globalProbe), false);
  assert.equal(fs.existsSync(marker), false);
  for (const alias of ['ttr', 'tuturuuu', 'tutur3u'])
    assert.equal(
      fs.readlinkSync(path.join(bin, alias)),
      '../tuturuuu/dist/cli/index.js'
    );
  // The detector does not execute or silently remove any orphan.
  execFileSync(process.execPath, [path.join(bin, 'ttr')], { env });
  assert.equal(fs.readFileSync(marker, 'utf8'), 'stale ran');
});
