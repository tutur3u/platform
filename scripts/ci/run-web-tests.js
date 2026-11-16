const path = require('node:path');
const { spawn } = require('node:child_process');
const { withDisposableRedis } = require('./disposable-redis.js');

// Launch the Vitest copy that apps/web itself resolves. Bun can install
// several peer-variant copies; running the root copy while test files import
// apps/web's copy splits runner and expect state, and every rejects.toThrow
// then sees an empty message.
function resolveWebVitest(webDir) {
  const manifest = require.resolve('vitest/package.json', { paths: [webDir] });
  return path.join(path.dirname(manifest), 'vitest.mjs');
}

function runWebTests({
  args = process.argv.slice(2),
  env = process.env,
  spawnImpl = spawn,
  fixture = withDisposableRedis,
  root = path.resolve(__dirname, '../..'),
  resolveVitest = resolveWebVitest,
} = {}) {
  const webDir = path.join(root, 'apps/web');
  return fixture({
    packages: ['@tuturuuu/web'],
    env,
    run: (fixtureEnv, signal) =>
      new Promise((resolve, reject) => {
        const child = spawnImpl(
          process.execPath,
          [resolveVitest(webDir), 'run', ...args],
          {
            cwd: webDir,
            env: fixtureEnv,
            stdio: 'inherit',
            signal,
          }
        );
        child.once('error', reject);
        child.once('close', (code) => resolve(code ?? 1));
      }),
  });
}

if (require.main === module) {
  runWebTests()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error('Web test fixture failed:', error.message);
      process.exitCode = 1;
    });
}
module.exports = { resolveWebVitest, runWebTests };
