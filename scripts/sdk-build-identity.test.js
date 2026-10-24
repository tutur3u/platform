const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function fixture(t, version, build) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-build-identity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cli = path.join(root, 'dist/cli');
  fs.mkdirSync(cli, { recursive: true });
  // Match the SDK's CommonJS package context.
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ version, tuturuuuBuild: build })
  );
  const helper = path.join(cli, 'build-identity.ts');
  fs.copyFileSync(
    path.join(__dirname, '../packages/sdk/src/cli/build-identity.ts'),
    helper
  );
  return { root, cli, helper };
}

test('installed identity reads staged package metadata in the SDK CommonJS context', (t) => {
  const sourceSha = 'abcdef0'.padEnd(40, '1');
  const f = fixture(t, '0.28.0-dev.123.abcdef0', { channel: 'dev', sourceSha });
  const evaluate = (expression) =>
    JSON.parse(
      execFileSync(
        'bun',
        [
          '-e',
          `const {installedBuildIdentity,packageBuildIdentity}=require(${JSON.stringify(f.helper)}); console.log(JSON.stringify(${expression}));`,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      )
    );
  assert.deepEqual(evaluate('installedBuildIdentity()'), {
    version: '0.28.0-dev.123.abcdef0',
    channel: 'dev',
    sourceSha,
  });
  assert.equal(
    evaluate('installedBuildIdentity().version'),
    '0.28.0-dev.123.abcdef0'
  );
  assert.deepEqual(evaluate('packageBuildIdentity({version:"0.28.0"})'), {
    version: '0.28.0',
    channel: 'latest',
    sourceSha: null,
  });
  assert.equal(
    evaluate(
      'packageBuildIdentity({version:"0.28.0",tuturuuuBuild:{sourceSha:"invalid"}})'
    ).sourceSha,
    null
  );
  assert.throws(() => evaluate('packageBuildIdentity({version:42})'));
});

test('top-level version probe preserves resource child version arguments', (t) => {
  const f = fixture(t, '0.28.0');
  const entry = path.join(f.cli, 'index.ts');
  fs.copyFileSync(
    path.join(__dirname, '../packages/sdk/src/cli/index.ts'),
    entry
  );
  fs.writeFileSync(
    path.join(f.cli, 'resources.js'),
    'exports.runResourcesCommand = async (args) => console.log(JSON.stringify(args));'
  );
  const probe = spawnSync('bun', [entry, '--version'], { encoding: 'utf8' });
  assert.equal(probe.status, 0, probe.stderr);
  assert.equal(probe.stdout.trim(), '0.28.0');
  const disabled = spawnSync('bun', [entry, '--no-update-check', '--version'], {
    encoding: 'utf8',
  });
  assert.equal(disabled.status, 0, disabled.stderr);
  assert.equal(disabled.stdout.trim(), '0.28.0');
  const child = spawnSync(
    'bun',
    [entry, 'resources', 'run', '--', 'node', '--version'],
    { encoding: 'utf8' }
  );
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), [
    'run',
    '--',
    'node',
    '--version',
  ]);
});

test('real index version output passes fleet auto-upgrade and subsequent verification', (t) => {
  const f = fixture(t, '0.29.0', {
    channel: 'latest',
    sourceSha: 'a'.repeat(40),
  });
  fs.copyFileSync(
    path.join(__dirname, '../packages/sdk/src/cli/index.ts'),
    path.join(f.cli, 'index.ts')
  );
  const launcher = path.join(f.cli, 'ttr.cjs');
  fs.writeFileSync(launcher, "require('./index.ts');");
  const upgrade = path.join(
    __dirname,
    '../packages/sdk/src/cli/devbox-auto-upgrade.ts'
  );
  const script = `const {upgradeDevboxCliIfNeeded}=require(${JSON.stringify(upgrade)});
const fs=require('node:fs'),cp=require('node:child_process'); let installs=0;
const options={currentVersion:'0.28.0',directory:${JSON.stringify(path.join(f.root, 'upgrades'))},now:100000,
cliCommand:['bun',${JSON.stringify(launcher)}],fetchImpl:async()=>new Response(JSON.stringify({version:'0.29.0'})),
runCommand:async(command,args)=>{if(args[0]==='i'){installs++; const manifest=JSON.parse(fs.readFileSync(${JSON.stringify(path.join(f.root, 'package.json'))}));manifest.version=args.at(-1).split('@').at(-1);fs.writeFileSync(${JSON.stringify(path.join(f.root, 'package.json'))},JSON.stringify(manifest));return {code:0,stdout:''};}const r=cp.spawnSync(command,args,{encoding:'utf8'});return {code:r.status,stdout:r.stdout};}};
(async()=>{const upgraded=await upgradeDevboxCliIfNeeded(options);const again=await upgradeDevboxCliIfNeeded(options);console.log(JSON.stringify({upgraded,again,installs}));})().catch(e=>{console.error(e);process.exitCode=1});`;
  const result = spawnSync('bun', ['-e', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    upgraded: true,
    again: true,
    installs: 1,
  });
});
