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
const workerJob = yaml.jobs['worker-bundle'];
const forbiddenOperations =
  /secrets\.|cloudflare\/wrangler-action@|\bwrangler(?:@[^\s]+)?\s|supabase|docker|deploy_target|workflow_call|pull_request_target/;

test('verification is manual, main-only and read-only with no deploy or secret inputs', () => {
  assert.deepEqual(Object.keys(yaml.on), ['workflow_dispatch']);
  assert.deepEqual(Object.keys(yaml.on.workflow_dispatch.inputs), [
    'source_sha',
  ]);
  assert.deepEqual(yaml.permissions, { contents: 'read' });
  assert.equal(job.if, "github.ref == 'refs/heads/main'");
  assert.equal(job.environment, undefined);
  assert.equal(job['timeout-minutes'], 45);
  assert.doesNotMatch(source, forbiddenOperations);
  for (const candidate of Object.values(yaml.jobs)) {
    assert.equal(candidate.if, "github.ref == 'refs/heads/main'");
    assert.equal(candidate.environment, undefined);
    assert.equal(candidate.permissions, undefined);
  }
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

test('native tests run before strict lint can block Worker packaging', () => {
  const native = job.steps.findIndex(
    (step) => step.name === 'Test native backend'
  );
  const clippy = job.steps.findIndex(
    (step) => step.name === 'Clippy native targets'
  );
  assert.ok(native >= 0 && native < clippy);
  assert.equal(job.steps[native].run, 'cargo test --locked');
  assert.equal(job.steps[native].if, undefined);
  assert.equal(
    job.steps[clippy].run,
    'cargo clippy --locked --all-targets --features native -- -D warnings'
  );
  assert.equal(job.steps[clippy]['continue-on-error'], undefined);
  assert.equal(job['continue-on-error'], undefined);
  assert.equal(workerJob.needs, 'verify');
  assert.doesNotMatch(workerJob.if, /always\(\)|failure\(\)/);
});

test('read-only guard rejects the Wrangler Action and executable forms', () => {
  for (const value of [
    'uses: cloudflare/wrangler-action@v3',
    `uses: cloudflare/wrangler-action@${'a'.repeat(40)}`,
    'run: wrangler deploy',
    'run: bunx wrangler@4 deploy',
  ])
    assert.match(value, forbiddenOperations);
  assert.doesNotMatch('sha256sum wrangler.jsonc', forbiddenOperations);
});

test('bundle work has a separate sequential bounded job with exact-source provenance', () => {
  assert.equal(workerJob.needs, 'verify');
  assert.equal(workerJob['timeout-minutes'], 60);
  assert.equal(workerJob.env.CARGO_BUILD_JOBS, '2');
  for (const name of [
    'Validate exact source SHA',
    'Checkout exact source',
    'Verify checked out source',
    'Setup repository minimum Rust toolchain',
  ]) {
    assert.deepEqual(
      workerJob.steps.find((step) => step.name === name),
      job.steps.find((step) => step.name === name)
    );
  }
  const install = workerJob.steps.find(
    (step) => step.name === 'Install pinned Worker bundler'
  );
  const bundle = workerJob.steps.find(
    (step) => step.name === 'Build actual Worker bundle'
  );
  assert.equal(install['timeout-minutes'], 25);
  assert.equal(bundle['timeout-minutes'], 30);
  for (const step of [install, bundle]) {
    assert.match(step.run, /trap .*elapsed seconds: \$SECONDS.* EXIT/);
  }
  assert.ok(
    !job.steps.some((step) => step.name === 'Install pinned Worker bundler')
  );
});

test('Worker bundler installation is pinned, locked and runner-local', () => {
  const install = workerJob.steps.find(
    (step) => step.name === 'Install pinned Worker bundler'
  );
  assert.match(
    install.run,
    /cargo install worker-build --version 0\.8\.7 --locked --root "\$RUNNER_TEMP\/worker-build"/
  );
  const bundle = workerJob.steps.find(
    (step) => step.name === 'Build actual Worker bundle'
  );
  assert.match(bundle.run, /test "\$\(worker-build --version\)" = '0\.8\.7'/);
  assert.match(
    bundle.run,
    /worker-build --release -- --locked --no-default-features --features worker/
  );
  assert.match(bundle.run, /set -euo pipefail/);
  assert.ok(workerJob.steps.indexOf(install) >= 0);
  assert.ok(workerJob.steps.indexOf(install) < workerJob.steps.indexOf(bundle));
});

test('semantic parser is an exact isolated public-registry tool with no scripts', () => {
  const install = workerJob.steps.find(
    (step) => step.name === 'Install pinned JavaScript parser'
  );
  assert.equal(install['timeout-minutes'], 3);
  assert.match(
    install.run,
    /npm install --prefix "\$RUNNER_TEMP\/worker-verify" --ignore-scripts --no-audit --no-fund --registry=https:\/\/registry\.npmjs\.org --save-exact acorn@8\.18\.0/
  );
  assert.ok(
    workerJob.steps.indexOf(install) <
      workerJob.steps.findIndex(
        (step) => step.name === 'Verify Worker package artifacts'
      )
  );
});

test('Worker package semantics reject entry drift, missing exports and broken modules', () => {
  const step = workerJob.steps.find(
    (step) => step.name === 'Verify Worker package artifacts'
  );
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'worker-package-contract-')
  );
  const summary = path.join(dir, 'summary');
  const run = () =>
    spawnSync('bash', ['-c', step.run], {
      cwd: dir,
      env: { ...process.env, GITHUB_STEP_SUMMARY: summary, RUNNER_TEMP: dir },
      encoding: 'utf8',
    });
  const parser = path.join(dir, 'worker-verify/node_modules/acorn');
  fs.mkdirSync(path.dirname(parser), { recursive: true });
  fs.symlinkSync(path.join(root, 'node_modules/acorn'), parser, 'dir');
  const config = path.join(dir, 'wrangler.jsonc');
  const shim = path.join(dir, 'build/worker/shim.mjs');
  const bundle = path.join(dir, 'build/index.js');
  const wasm = path.join(dir, 'build/index_bg.wasm');
  const validShim =
    "export * from '../index.js'; export { default } from '../index.js';";
  const validBundle =
    'class E {}; E.prototype.fetch = function () {}; export { E as default };';
  const validWasm = Buffer.from(
    '0061736d010000000104016000000302010007090105666574636800000a040102000b',
    'hex'
  );
  try {
    assert.notEqual(run().status, 0);
    fs.mkdirSync(path.dirname(shim), { recursive: true });
    fs.writeFileSync(config, JSON.stringify({ main: 'build/worker/shim.mjs' }));
    fs.writeFileSync(shim, validShim);
    fs.writeFileSync(bundle, validBundle);
    fs.writeFileSync(wasm, validWasm);
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      fs.readFileSync(summary, 'utf8'),
      /[a-f0-9]{64} +build\/index_bg\.wasm/
    );
    for (const [file, invalid, original] of [
      [
        config,
        JSON.stringify({ main: 'build/index.js' }),
        fs.readFileSync(config),
      ],
      [shim, "export { default } from '../missing.js';", validShim],
      [shim, "export * from '../index.js';", validShim],
      [bundle, 'export default {};', validBundle],
      [
        bundle,
        'class E {}; E.prototype.fetch = function () {}; export default {};',
        validBundle,
      ],
      [
        bundle,
        'class E {}; class Wrong {}; E.prototype.fetch = function () {}; export default new Proxy(Wrong, {});',
        validBundle,
      ],
      [
        bundle,
        'class E {}; E.prototype.fetch = function () {}; const Wrong={}; export { Wrong as default };',
        validBundle,
      ],
      [
        bundle,
        'let E=class {}; E.prototype.fetch = function () {}; E={}; export { E as default };',
        validBundle,
      ],
      [
        bundle,
        'let E=class {}; E.prototype.fetch = function () {}; E=class {}; export { E as default };',
        validBundle,
      ],
      [
        bundle,
        'class E {}; let Alias=E; Alias.prototype.fetch = function () {}; Alias=class {}; export { Alias as default };',
        validBundle,
      ],
      [
        bundle,
        'let E=class {}; E.prototype.fetch=function(){},E=class{}; export default new Proxy(E, {});',
        validBundle,
      ],
      [
        bundle,
        'class E {}; const decoy="E.prototype.fetch = function () {}"; export { E as default };',
        validBundle,
      ],
      [
        bundle,
        'class E {}; E.prototype.fetch = function () {}; const Proxy=Object; export default new Proxy(E, {});',
        validBundle,
      ],
      [bundle, 'E.prototype.fetch = ; export default {};', validBundle],
      [wasm, Buffer.from('0061736d01000000', 'hex'), validWasm],
      [wasm, 'invalid-wasm', validWasm],
    ]) {
      fs.writeFileSync(file, invalid);
      assert.notEqual(
        run().status,
        0,
        `${path.basename(file)} regression must fail`
      );
      fs.writeFileSync(file, original);
    }
    fs.unlinkSync(shim);
    assert.notEqual(run().status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
