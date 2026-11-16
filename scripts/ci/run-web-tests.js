const path = require('node:path');
const { spawn } = require('node:child_process');
const { withDisposableRedis } = require('./disposable-redis.js');

function runWebTests({
  args = process.argv.slice(2),
  env = process.env,
  spawnImpl = spawn,
  fixture = withDisposableRedis,
  root = path.resolve(__dirname, '../..'),
} = {}) {
  return fixture({
    packages: ['@tuturuuu/web'],
    env,
    run: (fixtureEnv, signal) =>
      new Promise((resolve, reject) => {
        const child = spawnImpl(
          process.execPath,
          [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', ...args],
          {
            cwd: path.join(root, 'apps/web'),
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
module.exports = { runWebTests };
