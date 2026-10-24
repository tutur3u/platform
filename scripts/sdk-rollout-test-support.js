const cp = require('node:child_process');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const vm = require('node:vm');

// Inject filesystem operations into unmodified source, including historical
// revisions, so RED evidence exercises the same swap and assertions as GREEN.
function loadRollout(name, overrides = {}) {
  const filename = path.join(__dirname, `sdk-rollout-${name}.js`);
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: Historical-source checks run directly with node --test, outside Turbo.
  const sourceRef = process.env.SDK_ROLLOUT_TEST_REF;
  const source = sourceRef
    ? cp.execFileSync(
        'git',
        ['show', `${sourceRef}:scripts/sdk-rollout-${name}.js`],
        { encoding: 'utf8' }
      )
    : fs.readFileSync(filename, 'utf8');
  const requireSource = createRequire(filename);
  const module = { exports: {} };
  const injectedFs = { ...fs, ...overrides };
  vm.compileFunction(
    `${source}\nmodule.exports.${name === 'state' ? 'cacheReferences = cacheReferences' : 'launcherHashes = launcherHashes'};`,
    ['require', 'module', 'exports', '__filename', '__dirname'],
    { filename }
  )(
    (id) => (id === 'node:fs' ? injectedFs : requireSource(id)),
    module,
    module.exports,
    filename,
    __dirname
  );
  return module.exports;
}

function beforeRead(file, swap) {
  const checked = fs.statSync(file);
  let calls = 0;
  return {
    readFileSync(input, ...args) {
      const matches =
        typeof input === 'number'
          ? (() => {
              const info = fs.fstatSync(input);
              return info.dev === checked.dev && info.ino === checked.ino;
            })()
          : input === file;
      if (matches && calls++ === 0) swap();
      return fs.readFileSync(input, ...args);
    },
    assertSwapped() {
      require('node:assert/strict').equal(calls, 1, 'swap hook ran once');
    },
  };
}

function assertChildCompletes(source, args = []) {
  const result = cp.spawnSync(process.execPath, ['-e', source, ...args], {
    cwd: __dirname,
    encoding: 'utf8',
    timeout: 2000,
    killSignal: 'SIGKILL',
  });
  const assert = require('node:assert/strict');
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

module.exports = { loadRollout, beforeRead, assertChildCompletes };
