const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('repo scripts and changed-file admission ignore a stale workspace dist on PATH', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trusted-ttr-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'user');
  const workspace = path.join(root, 'workspace');
  const globalBin = path.join(home, '.bun/bin');
  const workspaceBin = path.join(workspace, 'node_modules/.bin');
  const stale = path.join(workspace, 'packages/sdk/dist/cli/index.js');
  const launcher = path.join(root, 'resource-launcher');
  const observed = path.join(root, 'global-calls');
  for (const directory of [globalBin, workspaceBin, path.dirname(stale)])
    fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(launcher, 'trusted launcher bytes');
  fs.writeFileSync(
    stale,
    `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(launcher)},'stale dist rewrote launcher');process.stdout.write('{"installed":true,"enabled":true}');`,
    { mode: 0o700 }
  );
  fs.symlinkSync(stale, path.join(workspaceBin, 'ttr'));
  fs.writeFileSync(
    path.join(globalBin, 'ttr'),
    `#!${process.execPath}\nconst fs=require('node:fs');fs.appendFileSync(${JSON.stringify(observed)},JSON.stringify(process.argv.slice(2))+'\\n');process.stdout.write('{"installed":true,"enabled":true}');`,
    { mode: 0o700 }
  );
  const env = {
    ...process.env,
    HOME: home,
    PATH: `${workspaceBin}:${process.env.PATH}`,
  };
  const checker = path.join(__dirname, 'check-changed.js');
  execFileSync(
    process.execPath,
    [
      '-e',
      `const cp=require('node:child_process');const {ttrPrefix}=require(${JSON.stringify(checker)});const prefix=ttrPrefix(true,cp.execFileSync);if(!prefix)throw Error('admission missing');cp.execFileSync(prefix[0],prefix.slice(1));`,
    ],
    { cwd: workspace, env }
  );
  assert.equal(fs.readFileSync(launcher, 'utf8'), 'trusted launcher bytes');
  // Execute the exact package scripts, including Bun's normal PATH shadowing.
  for (const manifest of ['../package.json', '../packages/sdk/package.json']) {
    const file = path.resolve(__dirname, manifest);
    const script = JSON.parse(fs.readFileSync(file, 'utf8')).scripts.ttr;
    const [runtime, relative] = script.split(' ');
    assert.equal(runtime, 'node');
    execFileSync(
      process.execPath,
      [
        path.resolve(path.dirname(file), relative),
        'resources',
        'status',
        '--json',
      ],
      { cwd: workspace, env }
    );
  }
  const calls = fs
    .readFileSync(observed, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[1], ['resources', 'run', '--']);
});
