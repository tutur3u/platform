#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const GITIGNORE_PATH = path.join(ROOT_DIR, '.gitignore');
const ROOT_PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const BACKEND_WRANGLER_PATH = path.join(
  ROOT_DIR,
  'apps',
  'backend',
  'wrangler.jsonc'
);
const RUST_BACKEND_WORKFLOW_PATH = path.join(
  ROOT_DIR,
  '.github',
  'workflows',
  'rust-backend.yml'
);
const TANSTACK_WEB_PACKAGE_JSON_PATH = path.join(
  ROOT_DIR,
  'apps',
  'tanstack-web',
  'package.json'
);
const TANSTACK_WEB_VITE_CONFIG_PATH = path.join(
  ROOT_DIR,
  'apps',
  'tanstack-web',
  'vite.config.ts'
);
const TANSTACK_WEB_ROUTE_TREE_PATH = path.join(
  ROOT_DIR,
  'apps',
  'tanstack-web',
  'src',
  'routeTree.gen.ts'
);
const TANSTACK_WEB_WRANGLER_PATH = path.join(
  ROOT_DIR,
  'apps',
  'tanstack-web',
  'wrangler.jsonc'
);
const MIN_COMPATIBILITY_DATE = '2026-06-20';
const REQUIRED_SCHEMA_PATH = '../../node_modules/wrangler/config-schema.json';
const BACKEND_REQUIRED_SECRETS = [
  'BACKEND_INTERNAL_TOKEN',
  'TUTURUUU_APP_COORDINATION_SECRET',
  'CRON_SECRET',
  'DISCORD_APP_DEPLOYMENT_URL',
];
const TANSTACK_WEB_REQUIRED_SECRETS = [
  'BACKEND_PUBLIC_ORIGIN',
  'BACKEND_INTERNAL_URL',
  'BACKEND_INTERNAL_TOKEN',
];
const REQUIRED_OBSERVABILITY_HEAD_SAMPLING_RATE = 0.05;
const SECRET_VAR_NAME_PATTERN =
  /(^|_)(ACCESS_TOKEN|API_KEY|AUTHORIZATION|CREDENTIAL|INTERNAL_TOKEN|JWT|PASSWORD|PRIVATE_KEY|SECRET|TOKEN)($|_)/i;
const SECRET_VALUE_PATTERNS = [
  {
    label: 'a private key',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  },
  {
    label: 'a bearer token',
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]+/iu,
  },
  {
    label: 'a JWT',
    pattern: /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u,
  },
  {
    label: 'an API key',
    pattern: /\b(?:rk|sk)_(?:live|test)_[A-Za-z0-9_]{16,}\b/iu,
  },
];
const REQUIRED_CLOUDFLARE_SECRET_IGNORE_RULES = [
  '.dev.vars*',
  '**/.dev.vars*',
  '.env.preview*',
  '**/.env.preview*',
];

function readJson(filePath, fsImpl = fs) {
  return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function collectStringValues(value) {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStringValues(item));
  }

  if (isPlainObject(value)) {
    return Object.values(value).flatMap((item) => collectStringValues(item));
  }

  return [];
}

function formatList(values) {
  return values.join(', ');
}

function requireString(packageJson, fieldName, expectedValue, label) {
  if (packageJson[fieldName] !== expectedValue) {
    return `${label} must set ${fieldName} to ${expectedValue}.`;
  }

  return null;
}

function validateRootPackageJson(packageJson) {
  const errors = [];

  if (!packageJson.devDependencies?.wrangler) {
    errors.push('package.json must include wrangler as a root devDependency.');
  }

  if (
    packageJson.scripts?.['check:cloudflare'] !==
    'node scripts/check-cloudflare-workers.js'
  ) {
    errors.push(
      'package.json must expose check:cloudflare as node scripts/check-cloudflare-workers.js.'
    );
  }

  if (
    packageJson.scripts?.['smoke:cloudflare'] !==
    'node scripts/smoke-cloudflare-workers.js'
  ) {
    errors.push(
      'package.json must expose smoke:cloudflare as node scripts/smoke-cloudflare-workers.js.'
    );
  }

  return errors;
}

function validateRustBackendWorkflow(workflowContent) {
  const errors = [];
  const requiredSnippets = [
    'permissions:\n  contents: read',
    'apps/tanstack-web/migration/**',
    'apps/tanstack-web/package.json',
    'apps/tanstack-web/src/routeTree.gen.ts',
    'apps/tanstack-web/vite.config.ts',
    'apps/tanstack-web/wrangler.jsonc',
    'scripts/check-cloudflare-workers.js',
    'scripts/check-cloudflare-workers.test.js',
    'node scripts/check-cloudflare-workers.js',
    'cargo check --locked --target wasm32-unknown-unknown --no-default-features --features worker',
    'cargo install worker-build --locked',
    'worker-build --release -- --no-default-features --features worker',
  ];

  for (const snippet of requiredSnippets) {
    if (!workflowContent.includes(snippet)) {
      errors.push(
        `rust-backend.yml must include ${snippet} for Cloudflare Worker validation.`
      );
    }
  }

  return errors;
}

function validateCloudflareSecretIgnoreRules(gitignoreContent) {
  const gitignoreRules = new Set(
    gitignoreContent
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
  );
  const errors = [];

  for (const rule of REQUIRED_CLOUDFLARE_SECRET_IGNORE_RULES) {
    if (!gitignoreRules.has(rule)) {
      errors.push(
        `.gitignore must include ${rule} so Cloudflare local Worker secret files are never staged.`
      );
    }
  }

  return errors;
}

function validateRequiredSecrets(config, label, requiredSecrets) {
  const errors = [];
  const declaredSecrets = config.secrets?.required;

  if (!Array.isArray(declaredSecrets)) {
    errors.push(
      `${label} must declare secrets.required with ${formatList(requiredSecrets)}.`
    );
    return errors;
  }

  for (const secretName of declaredSecrets) {
    if (typeof secretName !== 'string' || secretName.trim() !== secretName) {
      errors.push(
        `${label} secrets.required entries must be trimmed secret names.`
      );
      continue;
    }

    if (!/^[A-Z][A-Z0-9_]*$/u.test(secretName)) {
      errors.push(
        `${label} secrets.required entry ${secretName} must use uppercase environment-variable naming.`
      );
    }
  }

  const declaredSecretSet = new Set(declaredSecrets);

  for (const requiredSecret of requiredSecrets) {
    if (!declaredSecretSet.has(requiredSecret)) {
      errors.push(`${label} secrets.required must include ${requiredSecret}.`);
    }
  }

  return errors;
}

function validateVarsDoNotContainSecrets(config, label, requiredSecrets) {
  const errors = [];
  const vars = config.vars;

  if (vars === undefined) {
    return errors;
  }

  if (!isPlainObject(vars)) {
    errors.push(`${label} vars must be an object when present.`);
    return errors;
  }

  const requiredSecretSet = new Set(requiredSecrets);

  for (const [varName, varValue] of Object.entries(vars)) {
    if (requiredSecretSet.has(varName)) {
      errors.push(
        `${label} vars.${varName} must be declared under secrets.required and configured with wrangler secret put, not vars.`
      );
    } else if (SECRET_VAR_NAME_PATTERN.test(varName)) {
      errors.push(
        `${label} vars.${varName} looks like a secret; configure it with wrangler secret put instead.`
      );
    }

    const secretValueMatch = collectStringValues(varValue).find((value) =>
      SECRET_VALUE_PATTERNS.some(({ pattern }) => pattern.test(value))
    );

    if (secretValueMatch) {
      const { label: valueLabel } = SECRET_VALUE_PATTERNS.find(({ pattern }) =>
        pattern.test(secretValueMatch)
      );
      errors.push(
        `${label} vars.${varName} appears to contain ${valueLabel}; keep secret values out of wrangler.jsonc.`
      );
    }
  }

  return errors;
}

function validateTanstackWebPackageJson(packageJson) {
  const errors = [];
  const requiredScripts = {
    'cf-typegen': 'wrangler types',
    'deploy:cloudflare': 'bun run build && wrangler deploy',
    'deploy:cloudflare:dry-run': 'bun run build && wrangler deploy --dry-run',
    'preview:cloudflare': 'wrangler dev',
  };

  if (!packageJson.devDependencies?.['@cloudflare/vite-plugin']) {
    errors.push(
      'apps/tanstack-web/package.json must include @cloudflare/vite-plugin as a devDependency.'
    );
  }

  if (!packageJson.devDependencies?.wrangler) {
    errors.push(
      'apps/tanstack-web/package.json must include wrangler as a devDependency.'
    );
  }

  for (const [scriptName, expectedValue] of Object.entries(requiredScripts)) {
    const error = requireString(
      packageJson.scripts ?? {},
      scriptName,
      expectedValue,
      'apps/tanstack-web/package.json scripts'
    );

    if (error) {
      errors.push(error);
    }
  }

  return errors;
}

function validateTanstackWebViteConfig(viteConfigContent) {
  const errors = [];

  if (
    !viteConfigContent.includes(
      "import { cloudflare } from '@cloudflare/vite-plugin';"
    )
  ) {
    errors.push(
      'apps/tanstack-web/vite.config.ts must import cloudflare from @cloudflare/vite-plugin.'
    );
  }

  const cloudflarePluginIndex = viteConfigContent.indexOf(
    "cloudflare({ viteEnvironment: { name: 'ssr' } })"
  );
  const cloudflarePluginSpreadIndex = viteConfigContent.indexOf(
    '...cloudflarePlugins'
  );
  const tanstackStartIndex = viteConfigContent.indexOf('tanstackStart()');

  if (cloudflarePluginIndex === -1) {
    errors.push(
      "apps/tanstack-web/vite.config.ts must register cloudflare({ viteEnvironment: { name: 'ssr' } })."
    );
  }

  if (!viteConfigContent.includes("mode === 'test' ? []")) {
    errors.push(
      'apps/tanstack-web/vite.config.ts must skip the Cloudflare Vite plugin in Vitest mode because the plugin rejects Vitest resolve.external options.'
    );
  }

  if (tanstackStartIndex === -1) {
    errors.push(
      'apps/tanstack-web/vite.config.ts must register tanstackStart().'
    );
  }

  if (
    cloudflarePluginSpreadIndex !== -1 &&
    tanstackStartIndex !== -1 &&
    cloudflarePluginSpreadIndex > tanstackStartIndex
  ) {
    errors.push(
      'apps/tanstack-web/vite.config.ts must register the Cloudflare Vite plugin before tanstackStart().'
    );
  }

  return errors;
}

function validateTanstackWebRouteTree(routeTreeContent) {
  const errors = [];
  const requiredSnippets = [
    "import type { getRouter } from './router.tsx'",
    "import type { createStart } from '@tanstack/react-start'",
    "declare module '@tanstack/react-start'",
    'router: Awaited<ReturnType<typeof getRouter>>',
  ];

  for (const snippet of requiredSnippets) {
    if (!routeTreeContent.includes(snippet)) {
      errors.push(
        `apps/tanstack-web/src/routeTree.gen.ts must preserve the TanStack Start Register augmentation snippet ${snippet}.`
      );
    }
  }

  return errors;
}

function validateWranglerBaseConfig(config, label, expected) {
  const errors = [];

  for (const [fieldName, expectedValue] of Object.entries(expected)) {
    if (fieldName === 'devPort') {
      continue;
    }

    if (config[fieldName] !== expectedValue) {
      errors.push(`${label} must set ${fieldName} to ${expectedValue}.`);
    }
  }

  if (config.$schema !== REQUIRED_SCHEMA_PATH) {
    errors.push(
      `${label} must use ${REQUIRED_SCHEMA_PATH} so editor/schema validation resolves from the repo root install.`
    );
  }

  if (
    typeof config.compatibility_date !== 'string' ||
    config.compatibility_date < MIN_COMPATIBILITY_DATE
  ) {
    errors.push(
      `${label} must use compatibility_date ${MIN_COMPATIBILITY_DATE} or newer.`
    );
  }

  if (!config.compatibility_flags?.includes('nodejs_compat')) {
    errors.push(`${label} must enable the nodejs_compat compatibility flag.`);
  }

  if (config.observability?.enabled !== true) {
    errors.push(`${label} must enable observability.`);
  }

  if (
    config.observability?.head_sampling_rate !==
    REQUIRED_OBSERVABILITY_HEAD_SAMPLING_RATE
  ) {
    errors.push(
      `${label} observability.head_sampling_rate must be ${REQUIRED_OBSERVABILITY_HEAD_SAMPLING_RATE}.`
    );
  }

  if (!isPlainObject(config.dev)) {
    errors.push(`${label} must define a dev object for local preview ports.`);
  } else {
    if (config.dev.local_protocol !== 'http') {
      errors.push(`${label} dev.local_protocol must be http.`);
    }

    if (config.dev.port !== expected.devPort) {
      errors.push(`${label} dev.port must be ${expected.devPort}.`);
    }
  }

  return errors;
}

function validateBackendWranglerConfig(config) {
  const errors = validateWranglerBaseConfig(
    config,
    'apps/backend/wrangler.jsonc',
    {
      devPort: 8780,
      main: 'build/worker/shim.mjs',
      name: 'tuturuuu-backend',
    }
  );

  if (
    config.build?.command !==
    'worker-build --release -- --no-default-features --features worker'
  ) {
    errors.push(
      'apps/backend/wrangler.jsonc must build the Rust Worker with worker-build --release -- --no-default-features --features worker.'
    );
  }

  errors.push(
    ...validateRequiredSecrets(
      config,
      'apps/backend/wrangler.jsonc',
      BACKEND_REQUIRED_SECRETS
    ),
    ...validateVarsDoNotContainSecrets(
      config,
      'apps/backend/wrangler.jsonc',
      BACKEND_REQUIRED_SECRETS
    )
  );

  if (config.vars?.BACKEND_ENV !== 'preview') {
    errors.push(
      'apps/backend/wrangler.jsonc must keep BACKEND_ENV as a non-secret preview default so Cloudflare preview does not run development-only backend paths.'
    );
  }

  if (config.vars?.BACKEND_SERVICE_NAME !== 'backend') {
    errors.push(
      'apps/backend/wrangler.jsonc must keep BACKEND_SERVICE_NAME as backend.'
    );
  }

  return errors;
}

function validateTanstackWebWranglerConfig(config) {
  const errors = validateWranglerBaseConfig(
    config,
    'apps/tanstack-web/wrangler.jsonc',
    {
      devPort: 8784,
      main: '@tanstack/react-start/server-entry',
      name: 'tuturuuu-tanstack-web',
    }
  );

  if (config.workers_dev !== true) {
    errors.push(
      'apps/tanstack-web/wrangler.jsonc must keep workers_dev enabled for preview deployments.'
    );
  }

  errors.push(
    ...validateRequiredSecrets(
      config,
      'apps/tanstack-web/wrangler.jsonc',
      TANSTACK_WEB_REQUIRED_SECRETS
    ),
    ...validateVarsDoNotContainSecrets(
      config,
      'apps/tanstack-web/wrangler.jsonc',
      TANSTACK_WEB_REQUIRED_SECRETS
    )
  );

  if (
    config.vars !== undefined &&
    (!isPlainObject(config.vars) || Object.keys(config.vars).length > 0)
  ) {
    errors.push(
      'apps/tanstack-web/wrangler.jsonc must not commit backend origins or tokens; set BACKEND_PUBLIC_ORIGIN, BACKEND_INTERNAL_URL, and BACKEND_INTERNAL_TOKEN with Wrangler secrets or deployment environment configuration.'
    );
  }

  return errors;
}

function checkCloudflareWorkersSetup({
  fsImpl = fs,
  rootDir = ROOT_DIR,
  rootPackageJson = readJson(path.join(rootDir, 'package.json'), fsImpl),
  backendWranglerConfig = readJson(
    path.join(rootDir, 'apps', 'backend', 'wrangler.jsonc'),
    fsImpl
  ),
  tanstackWebPackageJson = readJson(
    path.join(rootDir, 'apps', 'tanstack-web', 'package.json'),
    fsImpl
  ),
  rustBackendWorkflowContent = fsImpl.readFileSync(
    path.join(rootDir, '.github', 'workflows', 'rust-backend.yml'),
    'utf8'
  ),
  gitignoreContent = fsImpl.readFileSync(
    path.join(rootDir, '.gitignore'),
    'utf8'
  ),
  tanstackWebViteConfigContent = fsImpl.readFileSync(
    path.join(rootDir, 'apps', 'tanstack-web', 'vite.config.ts'),
    'utf8'
  ),
  tanstackWebRouteTreeContent = fsImpl.readFileSync(
    path.join(rootDir, 'apps', 'tanstack-web', 'src', 'routeTree.gen.ts'),
    'utf8'
  ),
  tanstackWebWranglerConfig = readJson(
    path.join(rootDir, 'apps', 'tanstack-web', 'wrangler.jsonc'),
    fsImpl
  ),
} = {}) {
  return [
    ...validateCloudflareSecretIgnoreRules(gitignoreContent),
    ...validateRootPackageJson(rootPackageJson),
    ...validateRustBackendWorkflow(rustBackendWorkflowContent),
    ...validateBackendWranglerConfig(backendWranglerConfig),
    ...validateTanstackWebPackageJson(tanstackWebPackageJson),
    ...validateTanstackWebViteConfig(tanstackWebViteConfigContent),
    ...validateTanstackWebRouteTree(tanstackWebRouteTreeContent),
    ...validateTanstackWebWranglerConfig(tanstackWebWranglerConfig),
  ];
}

if (require.main === module) {
  const errors = checkCloudflareWorkersSetup();

  if (errors.length > 0) {
    console.error(
      ['Cloudflare Worker deployment checks failed:', ...errors].join('\n- ')
    );
    process.exit(1);
  }
}

module.exports = {
  BACKEND_WRANGLER_PATH,
  GITIGNORE_PATH,
  ROOT_DIR,
  ROOT_PACKAGE_JSON_PATH,
  RUST_BACKEND_WORKFLOW_PATH,
  TANSTACK_WEB_PACKAGE_JSON_PATH,
  TANSTACK_WEB_ROUTE_TREE_PATH,
  TANSTACK_WEB_VITE_CONFIG_PATH,
  TANSTACK_WEB_WRANGLER_PATH,
  checkCloudflareWorkersSetup,
  validateBackendWranglerConfig,
  validateCloudflareSecretIgnoreRules,
  validateRootPackageJson,
  validateRustBackendWorkflow,
  validateTanstackWebPackageJson,
  validateTanstackWebRouteTree,
  validateTanstackWebViteConfig,
  validateTanstackWebWranglerConfig,
};
