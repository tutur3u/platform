const {
  DEFAULT_REGISTRY,
  packageVersionExists,
} = require('./package-release-registry.js');
const fs = require('node:fs');
const path = require('node:path');
const {
  dependencyFields,
  resolveWorkspaceDependencyVersion,
} = require('./prepare-npm-package-manifest.js');

const WORKFLOW_PACKAGE_PATH_PATTERN =
  /["'](packages\/[^"']+\/package\.json)["']/g;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function expandWorkspacePattern(repoRoot, pattern) {
  if (!pattern.endsWith('/*')) return [];

  const workspaceRoot = path.join(repoRoot, pattern.slice(0, -2));
  if (!fs.existsSync(workspaceRoot)) return [];

  return fs
    .readdirSync(workspaceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(workspaceRoot, entry.name, 'package.json'))
    .filter((packageJsonPath) => fs.existsSync(packageJsonPath));
}

function getWorkspacePackageJsonPaths(repoRoot) {
  const rootPackageJson = readJson(path.join(repoRoot, 'package.json'));
  const workspaces = rootPackageJson.workspaces ?? [];

  return workspaces.flatMap((pattern) =>
    expandWorkspacePattern(repoRoot, pattern)
  );
}

function getWorkspacePackages(repoRoot) {
  const workspacePackages = new Map();

  for (const packageJsonPath of getWorkspacePackageJsonPaths(repoRoot)) {
    const packageJson = readJson(packageJsonPath);

    if (!packageJson.name) continue;

    workspacePackages.set(packageJson.name, {
      packageDir: path.relative(repoRoot, path.dirname(packageJsonPath)),
      packageJson,
      packageJsonPath,
      version: packageJson.version,
    });
  }

  return workspacePackages;
}

function getReleaseWorkflowFiles(repoRoot) {
  const workflowsDir = path.join(repoRoot, '.github', 'workflows');

  if (!fs.existsSync(workflowsDir)) return [];

  return fs
    .readdirSync(workflowsDir)
    .filter((fileName) => /^release-.+-package\.ya?ml$/u.test(fileName))
    .sort();
}

function getPublishableWorkspacePackages(repoRoot) {
  const workspacePackages = getWorkspacePackages(repoRoot);
  const publishablePackages = new Map();

  for (const workflowName of getReleaseWorkflowFiles(repoRoot)) {
    const workflowPath = path.join(
      repoRoot,
      '.github',
      'workflows',
      workflowName
    );
    const workflow = fs.readFileSync(workflowPath, 'utf8');
    const packagePaths = [
      ...workflow.matchAll(WORKFLOW_PACKAGE_PATH_PATTERN),
    ].map((match) => match[1]);

    for (const packageJsonRelativePath of packagePaths) {
      const packageDir = path.dirname(packageJsonRelativePath);
      const packageJsonPath = path.join(repoRoot, packageJsonRelativePath);
      const packageJson = readJson(packageJsonPath);
      const workspacePackage = workspacePackages.get(packageJson.name);

      if (!workspacePackage || !packageJson.version) continue;

      publishablePackages.set(packageJson.name, {
        packageDir,
        packageJson,
        packageJsonPath,
        version: packageJson.version,
        workflowName,
      });
    }
  }

  return publishablePackages;
}

function getPackageInfo(repoRoot, packageDir) {
  const packageJsonPath = path.join(repoRoot, packageDir, 'package.json');
  const packageJson = readJson(packageJsonPath);

  if (!packageJson.name || !packageJson.version) {
    throw new Error(`${packageDir}/package.json must define name and version.`);
  }

  return {
    packageDir,
    packageJson,
    packageJsonPath,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
  };
}

function getWorkspaceDependencies({ packageDir, repoRoot }) {
  const { packageJson } = getPackageInfo(repoRoot, packageDir);
  const workspacePackages = getWorkspacePackages(repoRoot);
  const publishablePackages = getPublishableWorkspacePackages(repoRoot);
  const dependencies = [];
  const seen = new Set();

  for (const field of dependencyFields.filter(
    (field) => field !== 'devDependencies'
  )) {
    const packageDependencies = packageJson[field] ?? {};

    for (const [dependencyName, dependencyRange] of Object.entries(
      packageDependencies
    ).sort(([left], [right]) => left.localeCompare(right))) {
      if (
        typeof dependencyRange !== 'string' ||
        !dependencyRange.startsWith('workspace:')
      ) {
        continue;
      }

      const workspacePackage = workspacePackages.get(dependencyName);
      const publishablePackage = publishablePackages.get(dependencyName);

      if (!workspacePackage || !publishablePackage) continue;

      const dependencyVersion = resolveWorkspaceDependencyVersion(
        dependencyRange,
        workspacePackage.version
      );
      const key = `${dependencyName}@${dependencyVersion}`;

      if (seen.has(key)) continue;
      seen.add(key);

      dependencies.push({
        field,
        packageDir: publishablePackage.packageDir,
        packageName: dependencyName,
        packageVersion: dependencyVersion,
        workflowName: publishablePackage.workflowName,
      });
    }
  }

  return dependencies;
}

function packageHasWorkspaceDependency(packageJson, dependencyName) {
  for (const field of dependencyFields) {
    const dependencyRange = packageJson[field]?.[dependencyName];

    if (
      typeof dependencyRange === 'string' &&
      dependencyRange.startsWith('workspace:')
    ) {
      return true;
    }
  }

  return false;
}

function getDependentWorkspacePackages({
  packageDir,
  registry = DEFAULT_REGISTRY,
  repoRoot,
  versionExists = packageVersionExists,
}) {
  const { packageName } = getPackageInfo(repoRoot, packageDir);
  const publishablePackages = getPublishableWorkspacePackages(repoRoot);
  const dependents = [];

  for (const publishablePackage of [...publishablePackages.values()].sort(
    (left, right) => left.packageDir.localeCompare(right.packageDir)
  )) {
    if (publishablePackage.packageDir === packageDir) continue;

    if (
      !packageHasWorkspaceDependency(
        publishablePackage.packageJson,
        packageName
      )
    ) {
      continue;
    }

    if (
      versionExists({
        packageName: publishablePackage.packageJson.name,
        packageVersion: publishablePackage.version,
        registry,
      })
    ) {
      continue;
    }

    dependents.push({
      packageDir: publishablePackage.packageDir,
      packageName: publishablePackage.packageJson.name,
      packageVersion: publishablePackage.version,
      workflowName: publishablePackage.workflowName,
    });
  }

  return dependents;
}

module.exports = {
  readJson,
  expandWorkspacePattern,
  getWorkspacePackageJsonPaths,
  getWorkspacePackages,
  getReleaseWorkflowFiles,
  getPublishableWorkspacePackages,
  getPackageInfo,
  getWorkspaceDependencies,
  packageHasWorkspaceDependency,
  getDependentWorkspacePackages,
};
