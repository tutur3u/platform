const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  GITIGNORE_PATH,
  PAUSED_CLOUDFLARE_SCRIPT,
  ROOT_CLI_DEV_DEPENDENCY,
  ROOT_PACKAGE_JSON_PATH,
  checkCloudflareWorkersSetup,
  validateCloudflareSecretIgnoreRules,
  validateRootPackageJson,
} = require('./check-cloudflare-workers.js');

test('active Cloudflare Worker policy accepts the current repo state', () => {
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

test('root package.json retains the shared CLI devDependency and paused Cloudflare scripts', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(ROOT_PACKAGE_JSON_PATH, 'utf8')
  );

  assert.deepEqual(validateRootPackageJson(packageJson), []);
  assert.ok(packageJson.devDependencies?.[ROOT_CLI_DEV_DEPENDENCY]);
  assert.equal(
    packageJson.scripts['check:cloudflare'],
    PAUSED_CLOUDFLARE_SCRIPT
  );
  assert.equal(
    packageJson.scripts['smoke:cloudflare'],
    PAUSED_CLOUDFLARE_SCRIPT
  );
  const withoutCli = structuredClone(packageJson);
  delete withoutCli.devDependencies[ROOT_CLI_DEV_DEPENDENCY];
  assert.match(validateRootPackageJson(withoutCli).join('\n'), /devDependency/);
  packageJson.devDependencies[ROOT_CLI_DEV_DEPENDENCY] = '4.152.0';
  assert.match(
    validateRootPackageJson({
      ...packageJson,
      scripts: {
        ...packageJson.scripts,
        'check:cloudflare': 'node scripts/check-cloudflare-workers.js',
      },
    }).join('\n'),
    /check:cloudflare/
  );
});
