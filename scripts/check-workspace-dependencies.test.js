const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function expandWorkspacePattern(pattern) {
  if (!pattern.endsWith('/*')) {
    return [];
  }

  const workspaceRoot = path.join(repoRoot, pattern.slice(0, -2));
  if (!fs.existsSync(workspaceRoot)) {
    return [];
  }

  return fs
    .readdirSync(workspaceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(workspaceRoot, entry.name, 'package.json'))
    .filter((packageJsonPath) => fs.existsSync(packageJsonPath));
}

function getWorkspacePackageJsonPaths() {
  const rootPackageJsonPath = path.join(repoRoot, 'package.json');
  const rootPackageJson = readJson(rootPackageJsonPath);
  const workspacePackageJsonPaths = rootPackageJson.workspaces.flatMap(
    expandWorkspacePattern
  );

  return [rootPackageJsonPath, ...workspacePackageJsonPaths].sort();
}

test('local @tuturuuu packages use workspace protocol dependencies', () => {
  const packageJsonPaths = getWorkspacePackageJsonPaths();
  const workspacePackageNames = new Set(
    packageJsonPaths
      .map((packageJsonPath) => readJson(packageJsonPath).name)
      .filter((name) => typeof name === 'string')
  );
  const violations = [];

  for (const packageJsonPath of packageJsonPaths) {
    const packageJson = readJson(packageJsonPath);

    for (const field of dependencyFields) {
      const dependencies = packageJson[field] ?? {};

      for (const [dependencyName, dependencyVersion] of Object.entries(
        dependencies
      )) {
        if (
          workspacePackageNames.has(dependencyName) &&
          !dependencyVersion.startsWith('workspace:')
        ) {
          violations.push(
            `${path.relative(repoRoot, packageJsonPath)} ${field}.${dependencyName} uses ${dependencyVersion}`
          );
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});
