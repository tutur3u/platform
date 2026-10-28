const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { prepare, cleanup } = require('./index');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-hygiene-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const workspace = path.join(dir, 'workspace');
  fs.mkdirSync(workspace);
  const env = {
    RUNNER_TEMP: dir,
    GITHUB_WORKSPACE: workspace,
    GITHUB_ENV: path.join(dir, 'env'),
    GITHUB_STATE: path.join(dir, 'state'),
    HOME: path.join(dir, 'operator-home'),
  };
  fs.mkdirSync(env.HOME);
  fs.writeFileSync(path.join(env.HOME, 'credential-sentinel'), 'preserve');
  return env;
}

test('jobs use separate private homes and caches, then remove all checkout bytes', (t) => {
  const env = fixture(t);
  const first = prepare(env);
  const second = prepare(env);
  assert.notEqual(first.root, second.root);
  assert.equal(fs.statSync(first.root).mode & 0o777, 0o700);
  const exported = fs.readFileSync(env.GITHUB_ENV, 'utf8');
  for (const key of [
    'HOME',
    'BUN_INSTALL',
    'BUN_INSTALL_CACHE_DIR',
    'npm_config_cache',
    'GIT_CONFIG_GLOBAL',
  ]) {
    assert.ok(exported.includes(`${key}=${first.root}/`), key);
  }
  assert.ok(exported.includes('npm_config_ignore_scripts=true'));
  fs.writeFileSync(
    path.join(env.GITHUB_WORKSPACE, 'untracked-credential'),
    'remove'
  );
  fs.mkdirSync(path.join(env.GITHUB_WORKSPACE, '.git'));
  fs.writeFileSync(path.join(env.GITHUB_WORKSPACE, '.git/config'), 'remove');
  fs.symlinkSync(env.HOME, path.join(env.GITHUB_WORKSPACE, 'outside'));
  cleanup(first);
  assert.deepEqual(fs.readdirSync(env.GITHUB_WORKSPACE), []);
  assert.equal(fs.existsSync(first.root), false);
  assert.equal(fs.existsSync(second.root), true);
  assert.equal(
    fs.readFileSync(path.join(env.HOME, 'credential-sentinel'), 'utf8'),
    'preserve'
  );
});

test('cleanup rejects a replaced workspace and an unbounded state path', (t) => {
  const env = fixture(t);
  const state = prepare(env);
  assert.throws(
    () => cleanup({ ...state, root: env.RUNNER_TEMP }),
    /unsafe cleanup/
  );
  fs.renameSync(env.GITHUB_WORKSPACE, `${env.GITHUB_WORKSPACE}-original`);
  fs.symlinkSync(env.HOME, env.GITHUB_WORKSPACE);
  assert.throws(() => cleanup(state), /identity changed/);
  assert.equal(fs.existsSync(path.join(env.HOME, 'credential-sentinel')), true);
});
