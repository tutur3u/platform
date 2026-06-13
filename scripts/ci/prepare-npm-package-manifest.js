const fs = require('node:fs');
const path = require('node:path');

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
const publishDependencyOverrides = {
  '@tuturuuu/ui': {
    dependencies: {
      xlsx: 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz',
    },
  },
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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

function getWorkspaceVersions(repoRoot) {
  const workspaceVersions = new Map();

  for (const packageJsonPath of getWorkspacePackageJsonPaths(repoRoot)) {
    const packageJson = readJson(packageJsonPath);

    if (packageJson.name && packageJson.version) {
      workspaceVersions.set(packageJson.name, {
        path: packageJsonPath,
        version: packageJson.version,
      });
    }
  }

  return workspaceVersions;
}

function resolveWorkspaceDependencyVersion(workspaceRange, packageVersion) {
  const range = workspaceRange.slice('workspace:'.length);

  if (range === '' || range === '*') return packageVersion;
  if (range === '^') return `^${packageVersion}`;
  if (range === '~') return `~${packageVersion}`;

  return range;
}

function preparePackageManifest({ packageDir, repoRoot }) {
  const resolvedPackageDir = path.resolve(repoRoot, packageDir);
  const packageJsonPath = path.join(resolvedPackageDir, 'package.json');
  const packageJson = readJson(packageJsonPath);
  const workspaceVersions = getWorkspaceVersions(repoRoot);
  const rewrites = [];

  for (const field of dependencyFields) {
    const dependencies = packageJson[field] ?? {};

    for (const [dependencyName, dependencyVersion] of Object.entries(
      dependencies
    )) {
      if (
        typeof dependencyVersion !== 'string' ||
        !dependencyVersion.startsWith('workspace:')
      ) {
        continue;
      }

      const workspacePackage = workspaceVersions.get(dependencyName);

      if (!workspacePackage) {
        throw new Error(
          `${packageDir} references ${field}.${dependencyName} with ` +
            `${dependencyVersion}, but no matching workspace package exists.`
        );
      }

      const resolvedVersion = resolveWorkspaceDependencyVersion(
        dependencyVersion,
        workspacePackage.version
      );

      dependencies[dependencyName] = resolvedVersion;
      rewrites.push({
        field,
        from: dependencyVersion,
        name: dependencyName,
        to: resolvedVersion,
      });
    }
  }

  const dependencyOverrides =
    publishDependencyOverrides[packageJson.name] ?? {};

  for (const [field, dependencies] of Object.entries(dependencyOverrides)) {
    const packageDependencies = packageJson[field] ?? {};

    for (const [dependencyName, dependencyVersion] of Object.entries(
      dependencies
    )) {
      const currentVersion = packageDependencies[dependencyName];

      if (!currentVersion || currentVersion === dependencyVersion) continue;

      packageDependencies[dependencyName] = dependencyVersion;
      packageJson[field] = packageDependencies;
      rewrites.push({
        field,
        from: currentVersion,
        name: dependencyName,
        to: dependencyVersion,
      });
    }
  }

  if (rewrites.length > 0) {
    writeJson(packageJsonPath, packageJson);
  }

  return {
    packageJsonPath,
    rewrites,
  };
}

function main() {
  const packageDir = process.argv[2];

  if (!packageDir) {
    throw new Error(
      'Usage: node scripts/ci/prepare-npm-package-manifest.js <package-dir>'
    );
  }

  const repoRoot = path.resolve(__dirname, '..', '..');
  const { rewrites } = preparePackageManifest({ packageDir, repoRoot });

  if (rewrites.length === 0) {
    console.log(`${packageDir} has no workspace protocol dependencies.`);
    return;
  }

  for (const rewrite of rewrites) {
    console.log(
      `${packageDir} ${rewrite.field}.${rewrite.name}: ` +
        `${rewrite.from} -> ${rewrite.to}`
    );
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  dependencyFields,
  getWorkspaceVersions,
  preparePackageManifest,
  publishDependencyOverrides,
  resolveWorkspaceDependencyVersion,
};
