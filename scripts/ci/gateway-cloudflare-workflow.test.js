const assert = require('node:assert/strict');
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const name = 'gateway-cloudflare.yaml';

test('gateway Build Output qualification wires cf parity and dry-run only', () => {
  const workflow = readWorkflow(name);
  assert.equal(workflow.jobs['check-ci'].with.workflow_name, name);
  const steps = workflow.jobs['build-acceptance'].steps;
  const parity = steps.find((step) =>
    step.run?.includes('cf-worker-parity.mjs apps/gateway')
  );
  const dryRun = steps.find((step) =>
    step.run?.startsWith('bun x --no-install cf deploy --prebuilt')
  );
  assert.ok(parity);
  assert.ok(dryRun);
});

test('gateway publication rehearsal uses fixture origins and leaves the Build Output available for upload', async (t) => {
  const { rehearseGatewayCfPublication } =
    await import('./gateway-cf-publication.mjs');
  const { jobs } = readWorkflow(name);
  const steps = jobs['build-acceptance'].steps;
  const rehearsal = steps.find((step) =>
    step.run?.includes('gateway-cf-publication.mjs rehearse')
  );
  assert.ok(rehearsal);
  const appRoot = mkdtempSync(join(tmpdir(), 'gateway-build-output-'));
  t.after(() => rmSync(appRoot, { recursive: true, force: true }));
  const workerDir = join(appRoot, '.cloudflare/output/v0/workers/default');
  mkdirSync(workerDir, { recursive: true });
  const workerConfig = join(workerDir, 'worker.config.json');
  // The emitted cloudflare.config.ts env: committed text vars only.
  const emitted = `${JSON.stringify({
    name: 'tuturuuu-gateway',
    env: {
      GATEWAY_MODE: { type: 'text', value: 'active' },
      GATEWAY_MOUNTED_PATHS: { type: 'text', value: '' },
    },
  })}\n`;
  writeFileSync(workerConfig, emitted);
  let staged;

  const result = rehearseGatewayCfPublication({
    settingsPath: join(__dirname, 'fixtures/gateway-settings-fixture.json'),
    appRoot,
    env: { ...rehearsal.env, RUNNER_TEMP: appRoot },
    exec(command, args, options) {
      // An absolute pinned cf: the disposable copy is outside the workspace.
      assert.equal(
        command,
        join(__dirname, '../../apps/gateway/node_modules/.bin/cf')
      );
      assert.ok(args.includes('--dry-run'));
      assert.ok(args.includes('--no-provision'));
      staged = JSON.parse(
        readFileSync(
          join(
            options.cwd,
            '.cloudflare/output/v0/workers/default/worker.config.json'
          ),
          'utf8'
        )
      );
    },
  });
  assert.equal(result.publicationQualified, true);
  // The dry run sees the merged bindings; the archived artifact is untouched.
  assert.equal(staged.env.WEB_ORIGIN.value, 'https://web.example.vercel.app');
  assert.equal(readFileSync(workerConfig, 'utf8'), emitted);
});

test('the rehearsal resolves the pinned cf and dry-runs a real Build Output', async (t) => {
  const { rehearseGatewayCfPublication } =
    await import('./gateway-cf-publication.mjs');
  const appRoot = mkdtempSync(join(tmpdir(), 'gateway-real-cf-'));
  t.after(() => rmSync(appRoot, { recursive: true, force: true }));
  const v0 = join(appRoot, '.cloudflare/output/v0');
  mkdirSync(join(v0, 'workers/default/bundle'), { recursive: true });
  writeFileSync(
    join(v0, 'config.json'),
    JSON.stringify({ buildContext: { mode: 'production', isPreview: false } })
  );
  writeFileSync(
    join(v0, 'workers/default/worker.config.json'),
    JSON.stringify({
      name: 'tuturuuu-gateway',
      compatibilityDate: '2026-09-28',
      compatibilityFlags: [],
      env: { GATEWAY_MODE: { type: 'text', value: 'active' } },
      manifest: {
        type: 'complete',
        mainModule: 'index.js',
        modules: { 'index.js': { type: 'esm' } },
      },
    })
  );
  writeFileSync(
    join(v0, 'workers/default/bundle/index.js'),
    'export default { fetch() { return new Response("ok"); } };\n'
  );
  const result = rehearseGatewayCfPublication({
    settingsPath: join(__dirname, 'fixtures/gateway-settings-fixture.json'),
    appRoot,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      RUNNER_TEMP: appRoot,
      GATEWAY_PUBLICATION_REHEARSAL: '1',
      WEB_ORIGIN: 'https://web.example.vercel.app',
      MARKETING_ORIGIN: 'https://marketing.example.workers.dev',
    },
  });
  assert.equal(result.publicationQualified, true);
});
