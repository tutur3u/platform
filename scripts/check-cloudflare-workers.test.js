const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  BACKEND_WRANGLER_PATH,
  GITIGNORE_PATH,
  ROOT_PACKAGE_JSON_PATH,
  RUST_BACKEND_WORKFLOW_PATH,
  TANSTACK_WEB_PACKAGE_JSON_PATH,
  TANSTACK_WEB_ROUTE_TREE_PATH,
  TANSTACK_WEB_VITE_CONFIG_PATH,
  TANSTACK_WEB_WRANGLER_PATH,
  checkCloudflareWorkersSetup,
  validateBackendWranglerConfig,
  validateCloudflareSecretIgnoreRules,
  validateRustBackendWorkflow,
  validateTanstackWebViteConfig,
  validateTanstackWebRouteTree,
  validateTanstackWebWranglerConfig,
} = require('./check-cloudflare-workers.js');

test('Cloudflare Worker deployment config accepts the current repo state', () => {
  assert.deepEqual(checkCloudflareWorkersSetup(), []);
});

test('Cloudflare local Worker secret files stay ignored', () => {
  const gitignore = fs.readFileSync(GITIGNORE_PATH, 'utf8');

  assert.deepEqual(validateCloudflareSecretIgnoreRules(gitignore), []);
  assert.match(
    validateCloudflareSecretIgnoreRules(
      gitignore.replace('**/.dev.vars*', '')
    ).join('\n'),
    /\.dev\.vars/
  );
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

test('Wrangler configs reserve distinct local preview ports', () => {
  const backendConfig = JSON.parse(
    fs.readFileSync(BACKEND_WRANGLER_PATH, 'utf8')
  );
  const tanstackConfig = JSON.parse(
    fs.readFileSync(TANSTACK_WEB_WRANGLER_PATH, 'utf8')
  );

  assert.equal(backendConfig.dev.port, 8780);
  assert.equal(tanstackConfig.dev.port, 8784);
  assert.match(
    validateBackendWranglerConfig({
      ...backendConfig,
      dev: { ...backendConfig.dev, port: 8784 },
    }).join('\n'),
    /dev\.port must be 8780/
  );
  assert.match(
    validateTanstackWebWranglerConfig({
      ...tanstackConfig,
      dev: { ...tanstackConfig.dev, local_protocol: 'https' },
    }).join('\n'),
    /dev\.local_protocol must be http/
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

test('TanStack route tree preserves Start registration after generator runs', () => {
  const routeTree = fs.readFileSync(TANSTACK_WEB_ROUTE_TREE_PATH, 'utf8');

  assert.deepEqual(validateTanstackWebRouteTree(routeTree), []);
  assert.match(
    validateTanstackWebRouteTree(
      routeTree.replace(
        "import type { createStart } from '@tanstack/react-start'",
        ''
      )
    ).join('\n'),
    /TanStack Start Register augmentation/
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
