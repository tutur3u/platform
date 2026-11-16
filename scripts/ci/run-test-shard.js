#!/usr/bin/env node
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const { withDisposableRedis } = require('./disposable-redis.js');
const {
  commandForShard,
  discoverPackages,
  planShards,
} = require('./test-shards.js');

const [index, total, mode] = process.argv.slice(2);
if (
  !/^\d+$/.test(index ?? '') ||
  !/^\d+$/.test(total ?? '') ||
  (mode && mode !== '--coverage' && mode !== '--plan')
) {
  throw new Error(
    'Usage: node scripts/ci/run-test-shard.js <zero-based-index> <total> [--coverage|--plan]'
  );
}
const root = path.resolve(__dirname, '../..');
const shards = planShards(discoverPackages(root), Number(total));
const args = commandForShard(shards, Number(index), mode === '--coverage');
console.log(
  JSON.stringify({
    shard: Number(index),
    total: Number(total),
    ...shards[Number(index)],
  })
);
if (mode !== '--plan') {
  withDisposableRedis({
    packages: shards[Number(index)].packages,
    run: (env, signal) =>
      new Promise((resolve, reject) => {
        const child = spawn('bun', args, {
          cwd: root,
          stdio: 'inherit',
          env,
          detached: process.platform !== 'win32',
        });
        let timer;
        let exitCode;
        let graceFinished = false;
        const stop = () => {
          const kill = (signal) => {
            if (!child.pid) return;
            try {
              if (process.platform === 'win32') child.kill(signal);
              else process.kill(-child.pid, signal);
            } catch (error) {
              if (error.code !== 'ESRCH') throw error;
            }
          };
          kill('SIGTERM');
          timer = setTimeout(() => {
            kill('SIGKILL');
            graceFinished = true;
            if (exitCode !== undefined) resolve(exitCode);
          }, 5000);
        };
        signal?.addEventListener('abort', stop, { once: true });
        if (signal?.aborted) stop();
        child.once('error', reject);
        child.once('close', (code) => {
          signal?.removeEventListener('abort', stop);
          exitCode = code ?? 1;
          if (!signal?.aborted || graceFinished) {
            clearTimeout(timer);
            resolve(exitCode);
          }
        });
      }),
  })
    .then((code) => {
      process.exitCode = code;
      if (
        process.exitCode === 0 &&
        mode === '--coverage' &&
        shards[Number(index)].packages.includes('@tuturuuu/meet')
      ) {
        const focused = spawnSync(
          'bun',
          [
            'x',
            '--no-install',
            'vitest',
            'run',
            '--config',
            'vitest.native-auth.config.ts',
            '--maxWorkers=1',
            '--coverage',
            '--coverage.reportsDirectory=coverage/native-auth',
          ],
          {
            cwd: path.join(root, 'apps/meet'),
            stdio: 'inherit',
            env: process.env,
          }
        );
        if (focused.error) throw focused.error;
        process.exitCode = focused.status ?? 1;
      }
    })
    .catch((error) => {
      console.error('Test shard fixture/execution failed:', error.message);
      process.exitCode = 1;
    });
}
