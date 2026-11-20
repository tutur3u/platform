#!/usr/bin/env node
// Active Cloudflare Worker policy checks. Backend, TanStack Web and the Rust
// Worker deploy path are paused; their config guardrails live in paused-runtime
// fixtures. See apps/docs/build/devops/active-runtime.mdx.

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const GITIGNORE_PATH = path.join(ROOT_DIR, '.gitignore');
const ROOT_PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const PAUSED_CLOUDFLARE_SCRIPT = 'node scripts/paused-runtimes.js migration';
const ROOT_CLI_DEV_DEPENDENCY = 'wrangler';

const REQUIRED_CLOUDFLARE_SECRET_IGNORE_RULES = [
  '.dev.vars*',
  '**/.dev.vars*',
  '.env.preview*',
  '**/.env.preview*',
];

function readJson(filePath, fsImpl = fs) {
  return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
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

function validateRootPackageJson(packageJson) {
  const errors = [];

  if (!packageJson.devDependencies?.[ROOT_CLI_DEV_DEPENDENCY]) {
    errors.push(
      `package.json must include ${ROOT_CLI_DEV_DEPENDENCY} as a root devDependency.`
    );
  }

  for (const [scriptName, expected] of [
    ['check:cloudflare', PAUSED_CLOUDFLARE_SCRIPT],
    ['smoke:cloudflare', PAUSED_CLOUDFLARE_SCRIPT],
  ]) {
    if (packageJson.scripts?.[scriptName] !== expected) {
      errors.push(
        `package.json must expose ${scriptName} as ${expected} while the Rust/TanStack Worker path is paused.`
      );
    }
  }

  return errors;
}

function checkCloudflareWorkersSetup({
  fsImpl = fs,
  rootDir = ROOT_DIR,
  rootPackageJson = readJson(path.join(rootDir, 'package.json'), fsImpl),
} = {}) {
  const gitignoreContent = fsImpl.readFileSync(
    path.join(rootDir, '.gitignore'),
    'utf8'
  );
  return [
    ...validateCloudflareSecretIgnoreRules(gitignoreContent),
    ...validateRootPackageJson(rootPackageJson),
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
  GITIGNORE_PATH,
  PAUSED_CLOUDFLARE_SCRIPT,
  ROOT_CLI_DEV_DEPENDENCY,
  ROOT_DIR,
  ROOT_PACKAGE_JSON_PATH,
  checkCloudflareWorkersSetup,
  validateCloudflareSecretIgnoreRules,
  validateRootPackageJson,
};
