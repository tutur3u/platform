const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  BACKEND_README_PATH,
  BACKEND_WRANGLER_PATH,
  GITIGNORE_PATH,
  ROOT_PACKAGE_JSON_PATH,
  RUST_BACKEND_WORKFLOW_PATH,
  TANSTACK_RUST_MIGRATION_DOC_PATH,
  TANSTACK_WEB_PACKAGE_JSON_PATH,
  TANSTACK_WEB_ROUTE_TREE_PATH,
  TANSTACK_WEB_VITE_CONFIG_PATH,
  TANSTACK_WEB_WRANGLER_PATH,
  WEB_DOCKER_DEPLOYMENT_DOC_PATH,
  checkCloudflareWorkersSetup,
  validateBackendReadmeCloudflareSecrets,
  validateBackendWranglerConfig,
  validateCloudflarePreviewRunbook,
  validateCloudflareSecretIgnoreRules,
  validateRootPackageJson,
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
  assert.match(
    validateRustBackendWorkflow(
      workflow.replace('node scripts/check-cloudflare-workers.js', '')
    ).join('\n'),
    /check-cloudflare-workers/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replaceAll('scripts/smoke-cloudflare-workers.test.js', '')
    ).join('\n'),
    /smoke-cloudflare-workers/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replace(
        'node --test scripts/smoke-cloudflare-workers.test.js',
        ''
      )
    ).join('\n'),
    /smoke-cloudflare-workers/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replaceAll('apps/tanstack-web/wrangler.jsonc', '')
    ).join('\n'),
    /wrangler\.jsonc/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replaceAll(
        'apps/docs/platform/architecture/tanstack-rust-migration.mdx',
        ''
      )
    ).join('\n'),
    /tanstack-rust-migration/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replaceAll('apps/backend/README.md', '')
    ).join('\n'),
    /README/
  );
});

test('Backend README documents every required Cloudflare Worker secret', () => {
  const readme = fs.readFileSync(BACKEND_README_PATH, 'utf8');

  assert.deepEqual(validateBackendReadmeCloudflareSecrets(readme), []);
  assert.match(
    validateBackendReadmeCloudflareSecrets(
      readme.replace(
        'bun wrangler secret put DISCORD_APP_DEPLOYMENT_URL --config apps/backend/wrangler.jsonc',
        ''
      )
    ).join('\n'),
    /DISCORD_APP_DEPLOYMENT_URL/
  );
  assert.match(
    validateBackendReadmeCloudflareSecrets(
      readme.replace('secrets.required', 'secret names')
    ).join('\n'),
    /secrets\.required/
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

test('Wrangler configs require explicit observability sampling', () => {
  const backendConfig = JSON.parse(
    fs.readFileSync(BACKEND_WRANGLER_PATH, 'utf8')
  );
  const tanstackConfig = JSON.parse(
    fs.readFileSync(TANSTACK_WEB_WRANGLER_PATH, 'utf8')
  );

  assert.equal(backendConfig.observability.head_sampling_rate, 0.05);
  assert.equal(tanstackConfig.observability.head_sampling_rate, 0.05);
  assert.match(
    validateBackendWranglerConfig({
      ...backendConfig,
      observability: { enabled: true },
    }).join('\n'),
    /observability\.head_sampling_rate must be 0\.05/
  );
  assert.match(
    validateTanstackWebWranglerConfig({
      ...tanstackConfig,
      observability: {
        ...tanstackConfig.observability,
        head_sampling_rate: 1,
      },
    }).join('\n'),
    /observability\.head_sampling_rate must be 0\.05/
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
    validateBackendWranglerConfig({
      ...backendConfig,
      secrets: {
        required: [
          'BACKEND_INTERNAL_TOKEN',
          'TUTURUUU_APP_COORDINATION_SECRET',
        ],
      },
    }).join('\n'),
    /SUPABASE_URL/
  );
  assert.match(
    validateBackendWranglerConfig({
      ...backendConfig,
      secrets: {
        required: [
          'BACKEND_INTERNAL_TOKEN',
          'TUTURUUU_APP_COORDINATION_SECRET',
          'SUPABASE_URL',
        ],
      },
    }).join('\n'),
    /SUPABASE_SERVICE_ROLE_KEY/
  );
  assert.match(
    validateBackendWranglerConfig({
      ...backendConfig,
      secrets: {
        required: [
          'BACKEND_INTERNAL_TOKEN',
          'TUTURUUU_APP_COORDINATION_SECRET',
          'SUPABASE_URL',
          'SUPABASE_SERVICE_ROLE_KEY',
        ],
      },
    }).join('\n'),
    /CRON_SECRET/
  );
  assert.match(
    validateBackendWranglerConfig({
      ...backendConfig,
      secrets: {
        required: [
          'BACKEND_INTERNAL_TOKEN',
          'TUTURUUU_APP_COORDINATION_SECRET',
          'SUPABASE_URL',
          'SUPABASE_SERVICE_ROLE_KEY',
          'CRON_SECRET',
        ],
      },
    }).join('\n'),
    /DISCORD_APP_DEPLOYMENT_URL/
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

test('Cloudflare preview runbook documents required Worker secrets', () => {
  for (const [runbookPath, runbookLabel] of [
    [
      WEB_DOCKER_DEPLOYMENT_DOC_PATH,
      'apps/docs/build/devops/web-docker-deployment.mdx',
    ],
    [
      TANSTACK_RUST_MIGRATION_DOC_PATH,
      'apps/docs/platform/architecture/tanstack-rust-migration.mdx',
    ],
  ]) {
    const runbook = fs.readFileSync(runbookPath, 'utf8');

    assert.deepEqual(
      validateCloudflarePreviewRunbook(runbook, runbookLabel),
      []
    );
    assert.match(
      validateCloudflarePreviewRunbook(
        runbook.replace(
          'bun wrangler secret put SUPABASE_URL --config apps/backend/wrangler.jsonc',
          ''
        ),
        runbookLabel
      ).join('\n'),
      /SUPABASE_URL/
    );
    assert.match(
      validateCloudflarePreviewRunbook(
        runbook.replace(
          'bun wrangler versions secret put BACKEND_INTERNAL_URL --config apps/tanstack-web/wrangler.jsonc',
          ''
        ),
        runbookLabel
      ).join('\n'),
      /BACKEND_INTERNAL_URL/
    );
  }
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
    rootPackageJson.scripts['smoke:cloudflare'],
    'node scripts/smoke-cloudflare-workers.js'
  );
  assert.match(
    validateRootPackageJson({
      ...rootPackageJson,
      scripts: {
        ...rootPackageJson.scripts,
        'smoke:cloudflare': 'node scripts/smoke-cloudflare-workers.js --skip',
      },
    }).join('\n'),
    /smoke:cloudflare/
  );
  assert.equal(
    typeof tanstackPackageJson.scripts['deploy:cloudflare'],
    'string'
  );
});
