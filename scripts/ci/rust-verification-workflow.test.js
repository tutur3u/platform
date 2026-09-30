const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const test = require('node:test');
const { BACKEND_CHECK_STEPS } = require('../check-backend.js');

const root = path.resolve(__dirname, '../..');
const file = path.join(root, '.github/workflows/rust-verify.yml');
const source = fs.readFileSync(file, 'utf8');
const yaml = JSON.parse(
  execFileSync(
    'ruby',
    [
      '-ryaml',
      '-rjson',
      '-e',
      'data = YAML.load_file(ARGV[0]); data["on"] = data.delete(true) if data.key?(true); puts JSON.generate(data)',
      file,
    ],
    { encoding: 'utf8' }
  )
);
const job = yaml.jobs.verify;

test('verification is manual, main-only and read-only with no deploy or secret inputs', () => {
  assert.deepEqual(Object.keys(yaml.on), ['workflow_dispatch']);
  assert.deepEqual(Object.keys(yaml.on.workflow_dispatch.inputs), [
    'source_sha',
  ]);
  assert.deepEqual(yaml.permissions, { contents: 'read' });
  assert.equal(job.if, "github.ref == 'refs/heads/main'");
  assert.equal(job.environment, undefined);
  assert.equal(job['timeout-minutes'], 45);
  assert.doesNotMatch(
    source,
    /secrets\.|\bwrangler(?:@[^\s]+)?\s|supabase|docker|deploy_target|workflow_call|pull_request_target/
  );
  assert.match(
    fs.readFileSync(path.join(root, 'tuturuuu.ci.ts'), 'utf8'),
    /'rust-backend.yml': false/
  );
});

test('checkout uses only a validated immutable SHA and records exact source provenance', () => {
  const validate = job.steps[0];
  assert.equal(validate.name, 'Validate exact source SHA');
  for (const [value, succeeds] of [
    ['adc00c3dc90551b2024f4677c76d9151385918fe', true],
    ['74266d5ef8fcb23423b91d84832ff130a92b6378', true],
    ['main', false],
    ['adc00c3', false],
    [`${'a'.repeat(40)}\n`, false],
    ['$(touch unexpected)', false],
  ]) {
    const result = spawnSync('bash', ['-c', validate.run], {
      env: { ...process.env, SOURCE_SHA: value },
    });
    assert.equal(result.status === 0, succeeds, value);
  }
  const checkout = job.steps.find((step) =>
    step.uses?.startsWith('actions/checkout@')
  );
  assert.deepEqual(Object.keys(checkout.with), ['ref', 'persist-credentials']);
  assert.equal(checkout.with['persist-credentials'], false);
  assert.match(checkout.with.ref, /^\$\{\{ inputs\.source_sha \}\}$/);
  const provenance = job.steps.find(
    (step) => step.name === 'Verify checked out source'
  ).run;
  assert.match(provenance, /git rev-parse HEAD/);
  assert.match(
    provenance,
    /sha256sum apps\/backend\/Cargo.toml apps\/backend\/Cargo.lock/
  );
});

test('actual compile commands retain native and Worker feature contracts and locked resolution', () => {
  const commands = job.steps.map((step) => step.run || '').join('\n');
  for (const step of BACKEND_CHECK_STEPS)
    assert.ok(commands.includes(`cargo ${step.args.join(' ')}`));
  assert.match(
    commands,
    /cargo build --locked --release --features native --bin backend/
  );
  assert.match(commands, /cargo fetch --locked/);
  assert.equal(job.env.CARGO_BUILD_JOBS, '2');
  const setup = job.steps.find((step) => step.uses?.startsWith('dtolnay/'));
  assert.equal(setup.with.toolchain, '1.95.0');
  assert.equal(setup.with.targets, 'wasm32-unknown-unknown');
});

test('Worker bundler installation is pinned, locked and runner-local', () => {
  const install = job.steps.find(
    (step) => step.name === 'Install pinned Worker bundler'
  );
  assert.match(
    install.run,
    /cargo install worker-build --version 0\.8\.7 --locked --root "\$RUNNER_TEMP\/worker-build"/
  );
  const bundle = job.steps.find(
    (step) => step.name === 'Build actual Worker bundle'
  );
  assert.match(bundle.run, /test "\$\(worker-build --version\)" = '0\.8\.7'/);
  assert.match(
    bundle.run,
    /worker-build --release -- --locked --no-default-features --features worker/
  );
  assert.match(bundle.run, /set -euo pipefail/);
  assert.ok(job.steps.indexOf(install) < job.steps.indexOf(bundle));
});

test('Worker package validation rejects missing or corrupt emitted artifacts', () => {
  const step = job.steps.find(
    (step) => step.name === 'Verify Worker package artifacts'
  );
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'worker-package-contract-')
  );
  const summary = path.join(dir, 'summary');
  const run = () =>
    spawnSync('bash', ['-c', step.run], {
      cwd: dir,
      env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
      encoding: 'utf8',
    });
  try {
    assert.notEqual(run().status, 0, 'missing package must fail');
    fs.mkdirSync(path.join(dir, 'build/worker'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'wrangler.jsonc'), '{}');
    fs.writeFileSync(
      path.join(dir, 'build/worker/shim.mjs'),
      "export * from '../index.js';"
    );
    fs.writeFileSync(path.join(dir, 'build/index.js'), 'export default {};');
    const wasm = path.join(dir, 'build/index_bg.wasm');
    fs.writeFileSync(wasm, 'invalid-wasm');
    assert.notEqual(run().status, 0, 'invalid WASM header must fail');
    fs.writeFileSync(wasm, Buffer.from('0061736d01000000', 'hex'));
    assert.equal(run().status, 0);
    const hashes = fs.readFileSync(summary, 'utf8');
    assert.match(hashes, /[a-f0-9]{64} +build\/index_bg\.wasm/);
    fs.unlinkSync(path.join(dir, 'build/worker/shim.mjs'));
    assert.notEqual(
      run().status,
      0,
      'configured compatibility entry point must exist'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
