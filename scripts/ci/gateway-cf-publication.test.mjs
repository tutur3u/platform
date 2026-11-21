import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  injectMergedBindings,
  mergedBindings,
  publishGatewayVersionOnly,
  rehearseGatewayCfPublication,
  writeMergedDeployConfig,
} from './gateway-cf-publication.mjs';
import { cfPrebuiltArgs } from './cf-build-output-publisher.mjs';

const fixture = new URL(
  './fixtures/gateway-settings-fixture.json',
  import.meta.url
);
const gatewayRoot = fileURLToPath(
  new URL('../../apps/gateway', import.meta.url)
);

test('version-only cf args match M4 gateway publication contract', () => {
  const args = cfPrebuiltArgs({
    traffic: 'version-only',
    dryRun: false,
    sha: 'a'.repeat(40),
    digest: 'd'.repeat(64),
    workerName: 'tuturuuu-gateway',
  });
  assert.ok(args.includes('versions'));
  assert.ok(args.includes('--prebuilt'));
  assert.equal(args.includes('deploy'), false);
});

test('merged deploy config preserves gateway merge parity', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-cf-'));
  try {
    const out = join(dir, 'wrangler.deploy.json');
    const settingsPath = fileURLToPath(fixture);
    const config = writeMergedDeployConfig(settingsPath, out, {
      GATEWAY_WEB_FAMILIES: '',
      WEB_ORIGIN: 'https://web.example.vercel.app',
      MARKETING_ORIGIN: 'https://marketing.example.workers.dev',
    });
    assert.equal(config.name, 'tuturuuu-gateway');
    assert.ok(readFileSync(out, 'utf8').includes('tuturuuu-gateway'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('publish-version-only requires owner LIVE gate', () => {
  assert.throws(
    () =>
      publishGatewayVersionOnly({
        settingsPath: fileURLToPath(fixture),
        env: {
          GATEWAY_CF_VERSION_UPLOAD_LIVE: 'false',
          CLOUDFLARE_API_TOKEN: 'token',
          CLOUDFLARE_ACCOUNT_ID: 'account',
          RUNNER_TEMP: mkdtempSync(join(tmpdir(), 'gw-live-')),
        },
        cfToken: 'token',
        accountId: 'account',
        sha: 'b'.repeat(40),
        digest: 'c'.repeat(64),
      }),
    /GATEWAY_CF_VERSION_UPLOAD_LIVE|'false' !== 'true'/
  );
});

test('rehearse rejects credentials and requires rehearsal flag', () => {
  assert.throws(
    () =>
      rehearseGatewayCfPublication({
        settingsPath: fileURLToPath(fixture),
        env: {
          GATEWAY_PUBLICATION_REHEARSAL: '1',
          CLOUDFLARE_API_TOKEN: 'secret',
          RUNNER_TEMP: mkdtempSync(join(tmpdir(), 'gw-')),
        },
      }),
    /forbids deploy credentials/
  );
});

function buildOutput(env) {
  const root = mkdtempSync(join(tmpdir(), 'gateway-output-'));
  const dir = join(root, '.cloudflare/output/v0/workers/default');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'worker.config.json'),
    JSON.stringify({
      name: 'tuturuuu-gateway',
      compatibilityDate: '2026-09-28',
      env,
      manifest: { type: 'complete', mainModule: 'index.js', modules: {} },
    })
  );
  return root;
}

const merged = {
  name: 'tuturuuu-gateway',
  vars: { GATEWAY_MODE: 'active', WEB_ORIGIN: 'https://origin.example' },
  services: [
    { binding: 'MOUNT_LEARN', service: 'tuturuuu-learn' },
    {
      binding: 'WEB_FAMILY_PUBLIC_DOCS',
      service: 'tuturuuu-web-public-docs',
      entrypoint: 'Family',
    },
  ],
};

test('the cf upload carries the merged vars and service bindings', () => {
  const root = buildOutput({
    GATEWAY_MODE: { type: 'text', value: 'active' },
  });
  try {
    const worker = injectMergedBindings(root, merged);
    assert.deepEqual(worker.env, {
      GATEWAY_MODE: { type: 'text', value: 'active' },
      WEB_ORIGIN: { type: 'text', value: 'https://origin.example' },
      MOUNT_LEARN: { type: 'worker', worker: 'tuturuuu-learn' },
      WEB_FAMILY_PUBLIC_DOCS: {
        type: 'worker',
        worker: 'tuturuuu-web-public-docs',
        exportName: 'Family',
      },
    });
    assert.equal(worker.compatibilityDate, '2026-09-28');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('injection refuses to drop an emitted binding', () => {
  for (const env of [
    { EXTRA: { type: 'text', value: 'x' } },
    { CACHE: { type: 'kv', id: 'kv' } },
  ]) {
    const root = buildOutput(env);
    try {
      assert.throws(() => injectMergedBindings(root, merged));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  assert.throws(
    () =>
      mergedBindings({
        services: [{ binding: 'X', service: 'y', environment: 'production' }],
      }),
    /X: env/
  );
});

test('the gated cf upload verifies merged bindings and serving secrets', () => {
  const V2 = '22222222-2222-4222-8222-222222222222';
  const root = buildOutput({ GATEWAY_MODE: { type: 'text', value: 'active' } });
  const settingsPath = join(root, 'settings.json');
  writeFileSync(
    settingsPath,
    JSON.stringify({
      success: true,
      result: {
        bindings: [
          {
            type: 'plain_text',
            name: 'WEB_ORIGIN',
            text: 'https://web.example',
          },
          {
            type: 'plain_text',
            name: 'MARKETING_ORIGIN',
            text: 'https://marketing.example',
          },
          { type: 'secret_text', name: 'TRUSTED_PROXY_ORIGIN_SECRET' },
        ],
      },
    })
  );
  const emitted = readFileSync(
    join(root, '.cloudflare/output/v0/workers/default/worker.config.json'),
    'utf8'
  );
  const upload = (bindings) =>
    publishGatewayVersionOnly({
      settingsPath,
      appRoot: root,
      env: {
        GATEWAY_CF_VERSION_UPLOAD_LIVE: 'true',
        RUNNER_TEMP: root,
        WEB_ORIGIN: 'https://web.example',
        MARKETING_ORIGIN: 'https://marketing.example',
        GATEWAY_WEB_FAMILIES: '',
      },
      exec: (_command, _args, options) => {
        // The upload sees the injected bindings; record them as text wire.
        uploadedEnv = JSON.parse(
          readFileSync(
            join(
              options.cwd,
              '.cloudflare/output/v0/workers/default/worker.config.json'
            ),
            'utf8'
          )
        ).env;
        return `Worker Version ID: ${V2}\n`;
      },
      sha: 'a'.repeat(40),
      digest: 'a'.repeat(40),
      cfToken: 'token',
      accountId: 'e'.repeat(32),
      readVersion: () => ({
        compatibility_date: '2026-09-28',
        main_module: 'index.js',
        bindings,
      }),
    });
  let uploadedEnv;
  try {
    assert.throws(
      () => upload([]),
      /GATEWAY_MODE: expected plain_text, got missing/
    );
    // Record the injected bindings as the version readback names them.
    const wire = Object.entries(uploadedEnv).map(([name, binding]) =>
      binding.type === 'worker'
        ? { type: 'service', name, service: binding.worker }
        : { type: 'plain_text', name, text: binding.value }
    );
    assert.throws(
      () => upload(wire),
      /TRUSTED_PROXY_ORIGIN_SECRET: serving secret missing from upload/
    );
    assert.equal(
      upload([
        ...wire,
        { type: 'secret_text', name: 'TRUSTED_PROXY_ORIGIN_SECRET' },
      ]).versionId,
      V2
    );
    assert.equal(
      readFileSync(
        join(root, '.cloudflare/output/v0/workers/default/worker.config.json'),
        'utf8'
      ),
      emitted
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
