const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('bun install replaces stale workspace bin links without rebuilding dist', (t) => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-ttr-bin-'))
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sdk = path.join(root, 'packages/sdk');
  const bin = path.join(root, 'node_modules/.bin');
  const legacy = path.join(sdk, 'dist/cli/index.js');
  const marker = path.join(root, 'legacy-executed');
  for (const dir of [
    bin,
    path.dirname(legacy),
    path.join(sdk, 'bin'),
    path.join(sdk, 'src/cli'),
  ])
    fs.mkdirSync(dir, { recursive: true });
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../packages/sdk/package.json'))
  );
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'fixture',
      private: true,
      workspaces: ['packages/*'],
      dependencies: { tuturuuu: 'workspace:*' },
    })
  );
  fs.writeFileSync(
    path.join(sdk, 'package.json'),
    JSON.stringify({ name: 'tuturuuu', version: '0.28.0', bin: manifest.bin })
  );
  fs.writeFileSync(
    legacy,
    `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)},'legacy ran');`
  );
  fs.writeFileSync(path.join(sdk, 'src/cli/index.ts'), '');
  fs.copyFileSync(
    path.resolve(__dirname, '../packages/sdk/bin/ttr.cjs'),
    path.join(sdk, 'bin/ttr.cjs')
  );
  fs.symlinkSync(sdk, path.join(root, 'node_modules/tuturuuu'));
  fs.symlinkSync('../tuturuuu/dist/cli/index.js', path.join(bin, 'ttr'));
  const env = {
    ...process.env,
    HOME: root,
    BUN_INSTALL_CACHE_DIR: path.join(root, 'cache'),
  };
  execFileSync('bun', ['install', '--ignore-scripts', '--offline'], {
    cwd: root,
    env,
    stdio: 'pipe',
  });
  const bunx = spawnSync(
    'bun',
    ['x', '--no-install', 'ttr', 'resources', 'status'],
    { cwd: root, env, encoding: 'utf8' }
  );
  assert.equal(
    fs.existsSync(marker),
    false,
    'stale workspace dist was executed'
  );
  assert.equal(bunx.status, 1);
  assert.match(bunx.stderr, /Workspace ttr bin is disabled/);
  assert.equal(fs.existsSync(marker), false);
  for (const alias of Object.keys(manifest.bin)) {
    const file = path.join(bin, alias);
    assert.equal(fs.realpathSync(file), path.join(sdk, 'bin/ttr.cjs'));
    const result = spawnSync(process.execPath, [file, 'resources', 'status'], {
      cwd: root,
      env,
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /Workspace ttr bin is disabled.*~\/.bun\/bin\/ttr/
    );
  }
  // A packaged installation omits source and must still execute its CLI.
  fs.unlinkSync(path.join(sdk, 'src/cli/index.ts'));
  execFileSync(
    process.execPath,
    [path.join(bin, 'ttr'), 'resources', 'status'],
    { env }
  );
  assert.equal(fs.readFileSync(marker, 'utf8'), 'legacy ran');
});
