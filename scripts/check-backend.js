#!/usr/bin/env node

// One-shot local gate for the Rust backend (apps/backend), mirroring the
// .github/workflows/rust-backend.yml job so `bun check:backend` matches CI.
//
// Steps (fail-fast, in order):
//   1. cargo fmt --check
//   2. cargo clippy --locked --all-targets --features native -- -D warnings
//   3. cargo test --locked
//   4. cargo check --locked --target wasm32-unknown-unknown
//        --no-default-features --features worker   (Cloudflare Worker target)
//
// Flags:
//   --skip-worker   Skip the wasm32 worker-target check (step 4). Useful when
//                   the wasm32-unknown-unknown target is not installed locally.
//   --no-fail-fast  Run every step even if an earlier one fails; exit non-zero
//                   if any failed.

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { runAutoRustCacheCleanup } = require('./rust-cache.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'apps', 'backend');
const WORKER_TARGET = 'wasm32-unknown-unknown';

// The canonical gate. Kept in lockstep with rust-backend.yml; the paired test
// (scripts/check-backend.test.js) asserts these commands match the workflow.
const BACKEND_CHECK_STEPS = [
  { name: 'format', args: ['fmt', '--check'] },
  {
    name: 'clippy',
    args: [
      'clippy',
      '--locked',
      '--all-targets',
      '--features',
      'native',
      '--',
      '-D',
      'warnings',
    ],
  },
  { name: 'test', args: ['test', '--locked'] },
  {
    name: 'worker-target',
    worker: true,
    args: [
      'check',
      '--locked',
      '--target',
      WORKER_TARGET,
      '--no-default-features',
      '--features',
      'worker',
    ],
  },
];

function commandAvailable(command, args) {
  const result = spawnSync(command, args, { stdio: 'ignore' });
  return result.status === 0;
}

function workerTargetInstalled() {
  const result = spawnSync('rustup', ['target', 'list', '--installed'], {
    encoding: 'utf8',
  });
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    // rustup absent (e.g. distro-packaged rust); let cargo surface the error.
    return true;
  }
  return result.stdout
    .split('\n')
    .some((line) => line.trim() === WORKER_TARGET);
}

function runStep(step) {
  const printable = ['cargo', ...step.args].join(' ');
  console.log(`\n▸ ${step.name}: ${printable}`);
  const result = spawnSync('cargo', step.args, {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
  });
  return result.status === 0;
}

function runRustCacheAutoCleanup(env = process.env) {
  try {
    const result = runAutoRustCacheCleanup({ env });

    if (!result.skipped && result.removed.length > 0) {
      const removedBytes = result.removed.reduce(
        (sum, entry) => sum + entry.sizeBytes,
        0
      );
      console.log(
        `\n▸ rust-cache: removed ${result.removed.length} stale/oversized target entries (${removedBytes} bytes)`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n▸ rust-cache: warning: ${message}`);
  }
}

function main(argv = process.argv.slice(2)) {
  const skipWorker = argv.includes('--skip-worker');
  const failFast = !argv.includes('--no-fail-fast');

  if (!commandAvailable('cargo', ['--version'])) {
    console.error(
      'cargo not found. Install the Rust toolchain (https://rustup.rs) first.\n' +
        'The backend needs Rust (edition 2024). After install, ensure\n' +
        '`. "$HOME/.cargo/env"` is sourced so cargo is on PATH.'
    );
    return 1;
  }

  runRustCacheAutoCleanup();

  const failures = [];
  for (const step of BACKEND_CHECK_STEPS) {
    if (step.worker && skipWorker) {
      console.log(`\n▸ ${step.name}: skipped (--skip-worker)`);
      continue;
    }
    if (step.worker && !workerTargetInstalled()) {
      console.error(
        `\n▸ ${step.name}: target ${WORKER_TARGET} is not installed.\n` +
          `  Run: rustup target add ${WORKER_TARGET}\n` +
          '  (or pass --skip-worker to skip the Cloudflare Worker check).'
      );
      failures.push(step.name);
      if (failFast) break;
      continue;
    }
    if (!runStep(step)) {
      failures.push(step.name);
      if (failFast) break;
    }
  }

  if (failures.length > 0) {
    console.error(`\nbackend check FAILED at: ${failures.join(', ')}`);
    return 1;
  }
  console.log('\nbackend check passed: format, clippy, test, worker-target.');
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { BACKEND_CHECK_STEPS, WORKER_TARGET, main };
