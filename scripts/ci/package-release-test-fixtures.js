const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const silentLogger = { log() {} };

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createVersionExists(existingPackageVersions) {
  return ({ packageName, packageVersion }) =>
    existingPackageVersions.has(`${packageName}@${packageVersion}`);
}

function git(rootDir, args) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
}

function initializeGitRepo(rootDir) {
  git(rootDir, ['init', '-b', 'main']);
  git(rootDir, ['config', 'user.email', 'ci@example.com']);
  git(rootDir, ['config', 'user.name', 'CI Test']);
  git(rootDir, ['add', '.']);
  git(rootDir, ['commit', '-m', 'initial']);
}

function writeWorkflow(rootDir, workflowName, packageDir) {
  const workflowPath = path.join(rootDir, '.github', 'workflows', workflowName);

  fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
  fs.writeFileSync(
    workflowPath,
    [
      `name: Release ${packageDir} package`,
      'on:',
      '  push:',
      '    branches: [production]',
      '    paths:',
      `      - "${packageDir}/package.json"`,
      `      - ".github/workflows/${workflowName}"`,
      '',
    ].join('\n')
  );
}

function createFixtureRoot() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-readiness-'));

  writeJson(path.join(rootDir, 'package.json'), {
    private: true,
    workspaces: ['packages/*'],
  });
  writeJson(path.join(rootDir, 'packages/types/package.json'), {
    name: '@tuturuuu/types',
    version: '1.0.0',
  });
  writeJson(path.join(rootDir, 'packages/internal-api/package.json'), {
    dependencies: {
      '@tuturuuu/types': 'workspace:*',
      lodash: '^4.17.21',
    },
    devDependencies: {
      '@tuturuuu/typescript-config': 'workspace:^',
    },
    name: '@tuturuuu/internal-api',
    peerDependencies: {
      '@tuturuuu/non-publishable': 'workspace:*',
    },
    version: '2.0.0',
  });
  writeJson(path.join(rootDir, 'packages/typescript-config/package.json'), {
    name: '@tuturuuu/typescript-config',
    version: '3.0.0',
  });
  writeJson(path.join(rootDir, 'packages/non-publishable/package.json'), {
    name: '@tuturuuu/non-publishable',
    version: '4.0.0',
  });

  writeWorkflow(rootDir, 'release-types-package.yaml', 'packages/types');
  writeWorkflow(
    rootDir,
    'release-internal-api-package.yaml',
    'packages/internal-api'
  );
  writeWorkflow(
    rootDir,
    'release-typescript-config-package.yaml',
    'packages/typescript-config'
  );

  return rootDir;
}

module.exports = {
  silentLogger,
  writeJson,
  createVersionExists,
  git,
  initializeGitRepo,
  writeWorkflow,
  createFixtureRoot,
};
