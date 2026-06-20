const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  BACKEND_WRANGLER_PATH,
  ROOT_PACKAGE_JSON_PATH,
  RUST_BACKEND_WORKFLOW_PATH,
  TANSTACK_WEB_PACKAGE_JSON_PATH,
  TANSTACK_WEB_VITE_CONFIG_PATH,
  TANSTACK_WEB_WRANGLER_PATH,
  checkCloudflareWorkersSetup,
  validateBackendWranglerConfig,
  validateRustBackendWorkflow,
  validateTanstackWebViteConfig,
  validateTanstackWebWranglerConfig,
} = require('./check-cloudflare-workers.js');

test('Cloudflare Worker deployment config accepts the current repo state', () => {
  assert.deepEqual(checkCloudflareWorkersSetup(), []);
});

test('Rust backend workflow validates the Cloudflare Worker target', () => {
  const workflow = fs.readFileSync(RUST_BACKEND_WORKFLOW_PATH, 'utf8');

  assert.deepEqual(validateRustBackendWorkflow(workflow), []);
  assert.match(
    validateRustBackendWorkflow(
      workflow.replace(
        'worker-build --release -- --no-default-features --features worker',
        'cargo build --release'
      )
    ).join('\n'),
    /worker-build/
  );
});

test('TanStack Wrangler config requires Cloudflare Start Worker fields', () => {
  const config = JSON.parse(
    fs.readFileSync(TANSTACK_WEB_WRANGLER_PATH, 'utf8')
  );

  assert.deepEqual(validateTanstackWebWranglerConfig(config), []);
  assert.match(
    validateTanstackWebWranglerConfig({
      ...config,
      main: '.output/server/index.mjs',
      vars: {
        BACKEND_PUBLIC_ORIGIN: 'https://backend.example.com',
      },
      workers_dev: false,
    }).join('\n'),
    /@tanstack\/react-start\/server-entry/
  );
});

test('Backend Wrangler config keeps Rust Worker build and secret guardrails', () => {
  const config = JSON.parse(fs.readFileSync(BACKEND_WRANGLER_PATH, 'utf8'));

  assert.deepEqual(validateBackendWranglerConfig(config), []);
  assert.match(
    validateBackendWranglerConfig({
      ...config,
      build: { command: 'cargo build --release' },
      vars: {
        ...config.vars,
        BACKEND_INTERNAL_TOKEN: 'dev-token',
      },
    }).join('\n'),
    /worker-build --release/
  );
});

test('Wrangler configs declare required preview secrets by name', () => {
  const backendConfig = JSON.parse(
    fs.readFileSync(BACKEND_WRANGLER_PATH, 'utf8')
  );
  const tanstackConfig = JSON.parse(
    fs.readFileSync(TANSTACK_WEB_WRANGLER_PATH, 'utf8')
  );

  assert.match(
    validateBackendWranglerConfig({
      ...backendConfig,
      secrets: { required: [] },
    }).join('\n'),
    /BACKEND_INTERNAL_TOKEN/
  );
  assert.match(
    validateTanstackWebWranglerConfig({
      ...tanstackConfig,
      secrets: { required: ['BACKEND_PUBLIC_ORIGIN'] },
    }).join('\n'),
    /BACKEND_INTERNAL_URL/
  );
  assert.match(
    validateTanstackWebWranglerConfig({
      ...tanstackConfig,
      secrets: {
        required: ['BACKEND_PUBLIC_ORIGIN', 'BACKEND_INTERNAL_URL'],
      },
    }).join('\n'),
    /BACKEND_INTERNAL_TOKEN/
  );
});

test('Wrangler vars reject secret names and secret-looking values', () => {
  const backendConfig = JSON.parse(
    fs.readFileSync(BACKEND_WRANGLER_PATH, 'utf8')
  );
  const tanstackConfig = JSON.parse(
    fs.readFileSync(TANSTACK_WEB_WRANGLER_PATH, 'utf8')
  );

  assert.match(
    validateBackendWranglerConfig({
      ...backendConfig,
      vars: {
        ...backendConfig.vars,
        BACKEND_INTERNAL_TOKEN: 'dev-token',
      },
    }).join('\n'),
    /vars\.BACKEND_INTERNAL_TOKEN.*wrangler secret put/
  );
  assert.match(
    validateBackendWranglerConfig({
      ...backendConfig,
      vars: {
        ...backendConfig.vars,
        DIAGNOSTIC_HEADER: 'Bearer abc123',
      },
    }).join('\n'),
    /appears to contain a bearer token/
  );
  assert.match(
    validateBackendWranglerConfig({
      ...backendConfig,
      vars: {
        ...backendConfig.vars,
        BACKEND_ENV: 'development',
      },
    }).join('\n'),
    /preview default/
  );
  assert.match(
    validateTanstackWebWranglerConfig({
      ...tanstackConfig,
      vars: {
        PUBLIC_FLAG: '-----BEGIN PRIVATE KEY-----\nredacted',
      },
    }).join('\n'),
    /appears to contain a private key/
  );
});

test('TanStack Vite config keeps Cloudflare plugin before TanStack Start', () => {
  const viteConfig = fs.readFileSync(TANSTACK_WEB_VITE_CONFIG_PATH, 'utf8');

  assert.deepEqual(validateTanstackWebViteConfig(viteConfig), []);
  assert.match(
    validateTanstackWebViteConfig(
      viteConfig.replace(
        '...cloudflarePlugins,\n      tanstackStart(),',
        'tanstackStart(),\n      ...cloudflarePlugins,'
      )
    ).join('\n'),
    /before tanstackStart/
  );
  assert.match(
    validateTanstackWebViteConfig(
      viteConfig.replace("mode === 'test' ? []", 'false ? []')
    ).join('\n'),
    /Vitest mode/
  );
});

test('Cloudflare check reads package manifests from expected paths', () => {
  const rootPackageJson = JSON.parse(
    fs.readFileSync(ROOT_PACKAGE_JSON_PATH, 'utf8')
  );
  const tanstackPackageJson = JSON.parse(
    fs.readFileSync(TANSTACK_WEB_PACKAGE_JSON_PATH, 'utf8')
  );

  assert.equal(
    rootPackageJson.scripts['check:cloudflare'],
    'node scripts/check-cloudflare-workers.js'
  );
  assert.equal(
    typeof tanstackPackageJson.scripts['deploy:cloudflare'],
    'string'
  );
});
