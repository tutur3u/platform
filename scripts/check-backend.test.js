const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  BACKEND_CHECK_ENV,
  BACKEND_CHECK_STEPS,
  WORKER_TARGET,
} = require('./check-backend.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const WORKFLOW = fs.readFileSync(
  path.join(ROOT_DIR, '.github', 'workflows', 'rust-backend.yml'),
  'utf8'
);

function cargoLine(step) {
  return `cargo ${step.args.join(' ')}`;
}

test('every backend check step mirrors a command in rust-backend.yml', () => {
  for (const step of BACKEND_CHECK_STEPS) {
    assert.ok(
      WORKFLOW.includes(cargoLine(step)),
      `rust-backend.yml is missing the "${step.name}" command: ${cargoLine(step)}`
    );
  }
});

test('check covers the four CI gates (format, clippy, test, worker)', () => {
  const names = BACKEND_CHECK_STEPS.map((s) => s.name);
  assert.deepEqual(names, ['format', 'clippy', 'test', 'worker-target']);
});

test('backend checks use the CI memory profile for test builds', () => {
  assert.equal(BACKEND_CHECK_ENV.CARGO_PROFILE_TEST_DEBUG, '0');
  assert.match(WORKFLOW, /CARGO_PROFILE_TEST_DEBUG: "0"/u);
});

test('clippy step denies warnings and uses the native feature', () => {
  const clippy = BACKEND_CHECK_STEPS.find((s) => s.name === 'clippy');
  assert.ok(clippy.args.includes('-D'));
  assert.ok(clippy.args.includes('warnings'));
  assert.ok(clippy.args.includes('native'));
});

test('worker step targets the Cloudflare wasm triple with the worker feature', () => {
  const worker = BACKEND_CHECK_STEPS.find((s) => s.name === 'worker-target');
  assert.equal(WORKER_TARGET, 'wasm32-unknown-unknown');
  assert.ok(worker.args.includes(WORKER_TARGET));
  assert.ok(worker.args.includes('worker'));
  assert.ok(worker.args.includes('--no-default-features'));
});
