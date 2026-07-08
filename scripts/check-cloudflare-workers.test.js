const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  BACKEND_README_PATH,
  BACKEND_WRANGLER_PATH,
  GITIGNORE_PATH,
  GITHUB_ACTIONS_RUNBOOK_DOC_PATH,
  ROOT_PACKAGE_JSON_PATH,
  RUST_BACKEND_WORKFLOW_PATH,
  TANSTACK_RUST_MIGRATION_DOC_PATH,
  TANSTACK_WEB_PACKAGE_JSON_PATH,
  TANSTACK_WEB_ROUTE_TREE_PATH,
  TANSTACK_WEB_TSCONFIG_PATH,
  TANSTACK_WEB_VITE_CONFIG_PATH,
  TANSTACK_WEB_WRANGLER_PATH,
  WEB_DOCKER_DEPLOYMENT_DOC_PATH,
  checkCloudflareWorkersSetup,
  validateBackendReadmeCloudflareSecrets,
  validateBackendWranglerConfig,
  validateCloudflareActionsRunbook,
  validateCloudflarePreviewRunbook,
  validateCloudflareSecretIgnoreRules,
  validateRootPackageJson,
  validateRustBackendWorkflow,
  validateTanstackWebPackageJson,
  validateTanstackWebTsconfig,
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
      workflow.replaceAll('node scripts/check-cloudflare-workers.js', '')
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
      workflow.replaceAll('apps/tanstack-web/**', '')
    ).join('\n'),
    /tanstack-web/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replace('bun type-check:tanstack-web', '')
    ).join('\n'),
    /type-check/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replace('cloudflare-deployment-preflight:', '')
    ).join('\n'),
    /cloudflare-deployment-preflight/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replace("github.ref == 'refs/heads/main'", '')
    ).join('\n'),
    /refs\/heads\/main/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replaceAll('TRUSTED_CLOUDFLARE_DEPLOY_ACTORS', '')
    ).join('\n'),
    /TRUSTED_CLOUDFLARE_DEPLOY_ACTORS/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replace('post-deploy-smoke:', '')
    ).join('\n'),
    /post-deploy-smoke/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replace(
        "needs.cloudflare-deployment-preflight.outputs.deployment_mode == 'deploy'",
        ''
      )
    ).join('\n'),
    /deployment_mode/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replace("needs.deploy-tanstack-web.result == 'success'", '')
    ).join('\n'),
    /deploy-tanstack-web/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replaceAll('BACKEND_WORKER_ORIGIN', '')
    ).join('\n'),
    /BACKEND_WORKER_ORIGIN/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replaceAll('TANSTACK_WEB_WORKER_ORIGIN', '')
    ).join('\n'),
    /TANSTACK_WEB_WORKER_ORIGIN/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replaceAll('CLOUDFLARE_SMOKE_BACKEND_INTERNAL_TOKEN', '')
    ).join('\n'),
    /CLOUDFLARE_SMOKE_BACKEND_INTERNAL_TOKEN/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replace(
        'bun smoke:cloudflare --output "$CLOUDFLARE_SMOKE_REPORT_PATH"',
        ''
      )
    ).join('\n'),
    /smoke:cloudflare/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replace(
        'CLOUDFLARE_SMOKE_REPORT_PATH: tmp/benchmarks/web-migration/',
        ''
      )
    ).join('\n'),
    /tmp\/benchmarks\/web-migration/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replace('actions/upload-artifact@v7', '')
    ).join('\n'),
    /upload-artifact/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replaceAll('GITHUB_STEP_SUMMARY', '')
    ).join('\n'),
    /GITHUB_STEP_SUMMARY/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replace(
        'bun wrangler secret list --config apps/backend/wrangler.jsonc --format json',
        ''
      )
    ).join('\n'),
    /secret list/
  );
  assert.match(
    validateRustBackendWorkflow(
      workflow.replaceAll('packages/internal-api/src/backend.ts', '')
    ).join('\n'),
    /internal-api/
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

test('TanStack tsconfig resolves CI type-check workspace packages from source', () => {
  const tsconfig = JSON.parse(
    fs.readFileSync(TANSTACK_WEB_TSCONFIG_PATH, 'utf8')
  );

  assert.deepEqual(validateTanstackWebTsconfig(tsconfig), []);
  assert.match(
    validateTanstackWebTsconfig({
      ...tsconfig,
      compilerOptions: {
        ...tsconfig.compilerOptions,
        paths: {
          ...tsconfig.compilerOptions.paths,
          '@tuturuuu/types/*': ['../../packages/types/dist/*'],
        },
      },
    }).join('\n'),
    /@tuturuuu\/types\/\*/
  );
  assert.match(
    validateTanstackWebTsconfig({
      ...tsconfig,
      compilerOptions: {
        ...tsconfig.compilerOptions,
        paths: {
          ...tsconfig.compilerOptions.paths,
          '@tuturuuu/supabase': undefined,
        },
      },
    }).join('\n'),
    /@tuturuuu\/supabase/
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
    validateBackendWranglerConfig({
      ...backendConfig,
      secrets: {
        required: [
          'BACKEND_INTERNAL_TOKEN',
          'TUTURUUU_APP_COORDINATION_SECRET',
          'SUPABASE_URL',
          'SUPABASE_SERVICE_ROLE_KEY',
          'CRON_SECRET',
          'DISCORD_APP_DEPLOYMENT_URL',
          'AURORA_EXTERNAL_URL',
        ],
      },
    }).join('\n'),
    /AURORA_EXTERNAL_WSID/
  );
  assert.match(
    validateTanstackWebWranglerConfig({
      ...tanstackConfig,
      services: [],
    }).join('\n'),
    /BACKEND/
  );
  assert.match(
    validateTanstackWebWranglerConfig({
      ...tanstackConfig,
      services: [{ binding: 'BACKEND', service: 'wrong-backend' }],
    }).join('\n'),
    /tuturuuu-backend/
  );
  assert.match(
    validateTanstackWebWranglerConfig({
      ...tanstackConfig,
      secrets: {
        required: ['BACKEND_PUBLIC_ORIGIN'],
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
          'bun wrangler versions secret put BACKEND_INTERNAL_TOKEN --config apps/tanstack-web/wrangler.jsonc',
          ''
        ),
        runbookLabel
      ).join('\n'),
      /BACKEND_INTERNAL_TOKEN/
    );
  }
});

test('GitHub Actions runbook documents Cloudflare deployment env and warning guidance', () => {
  const runbook = fs.readFileSync(GITHUB_ACTIONS_RUNBOOK_DOC_PATH, 'utf8');
  const workflow = fs.readFileSync(RUST_BACKEND_WORKFLOW_PATH, 'utf8');

  assert.deepEqual(validateCloudflareActionsRunbook(runbook, workflow), []);
  assert.match(
    validateCloudflareActionsRunbook(
      runbook.replace('`CLOUDFLARE_ACCOUNT_ID`', '`CLOUDFLARE_ACCOUNT`'),
      workflow
    ).join('\n'),
    /CLOUDFLARE_ACCOUNT_ID/
  );
  assert.match(
    validateCloudflareActionsRunbook(
      runbook.replace('Cloudflare deployment skipped', 'Deployment skipped'),
      workflow
    ).join('\n'),
    /Cloudflare deployment skipped/
  );
  assert.match(
    validateCloudflareActionsRunbook(
      runbook.replace(
        'Cloudflare deploy credentials must not be exposed to arbitrary branch code',
        'Cloudflare deploy credentials are environment-scoped'
      ),
      workflow
    ).join('\n'),
    /arbitrary branch code/
  );
  assert.match(
    validateCloudflareActionsRunbook(
      runbook.replaceAll('TRUSTED_CLOUDFLARE_DEPLOY_ACTORS', ''),
      workflow
    ).join('\n'),
    /TRUSTED_CLOUDFLARE_DEPLOY_ACTORS/
  );
  assert.match(
    validateCloudflareActionsRunbook(
      runbook.replace(
        'reads only secret names, never secret values',
        'checks configured secrets'
      ),
      workflow
    ).join('\n'),
    /secret names/
  );
  assert.match(
    validateCloudflareActionsRunbook(
      runbook.replace('Cloudflare smoke verification blocked', 'Smoke blocked'),
      workflow
    ).join('\n'),
    /Cloudflare smoke verification blocked/
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
        '[...cloudflarePlugins, tanstackStartPlugin]',
        '[tanstackStartPlugin, ...cloudflarePlugins]'
      )
    ).join('\n'),
    /before tanstackStart/
  );
  assert.match(
    validateTanstackWebViteConfig(
      viteConfig.replace(/mode\s*===\s*['"]test['"]/gu, 'false')
    ).join('\n'),
    /Vitest mode/
  );
  assert.match(
    validateTanstackWebViteConfig(
      viteConfig.replace("import { nitro } from 'nitro/vite';", '')
    ).join('\n'),
    /nitro/
  );
  assert.match(
    validateTanstackWebViteConfig(
      viteConfig.replaceAll("runtime === 'vercel'", "runtime === 'node'")
    ).join('\n'),
    /TANSTACK_WEB_RUNTIME=vercel/
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
  assert.deepEqual(validateTanstackWebPackageJson(tanstackPackageJson), []);
  assert.match(
    validateTanstackWebPackageJson({
      ...tanstackPackageJson,
      scripts: {
        ...tanstackPackageJson.scripts,
        'build:vercel': 'vite build',
      },
    }).join('\n'),
    /build:vercel/
  );
});
