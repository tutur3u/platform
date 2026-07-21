const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function extractVendoredTarball({ archivePath, destinationPath, members }) {
  fs.rmSync(destinationPath, { force: true, recursive: true });
  fs.mkdirSync(destinationPath, { recursive: true });
  execFileSync(
    'tar',
    [
      '-xzf',
      archivePath,
      '--strip-components=1',
      '-C',
      destinationPath,
      ...members,
    ],
    { stdio: 'inherit' }
  );
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

function preparePackageManifest({
  extractTarball = extractVendoredTarball,
  packageDir,
  repoRoot,
}) {
  const resolvedPackageDir = path.resolve(repoRoot, packageDir);
  const packageJsonPath = path.join(resolvedPackageDir, 'package.json');
  const packageJson = readJson(packageJsonPath);
  const workspaceVersions = getWorkspaceVersions(repoRoot);
  const archivesToRemove = [];
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

  const vendoredDependencies =
    packageJson.tuturuuuPublish?.vendoredDependencies;

  if (vendoredDependencies) {
    for (const [dependencyName, vendoredDependency] of Object.entries(
      vendoredDependencies
    )) {
      const dependencyVersion = packageJson.dependencies?.[dependencyName];

      if (dependencyVersion !== vendoredDependency.source) {
        throw new Error(
          `${packageDir} must declare dependencies.${dependencyName} as ` +
            `${vendoredDependency.source} before it can be embedded for npm.`
        );
      }

      const archivePath = path.join(
        resolvedPackageDir,
        vendoredDependency.archive
      );
      const destinationPath = path.join(
        resolvedPackageDir,
        vendoredDependency.extractedDirectory
      );

      if (!fs.existsSync(archivePath)) {
        throw new Error(
          `${packageDir} is missing vendored archive ${vendoredDependency.archive}.`
        );
      }

      extractTarball({
        archivePath,
        destinationPath,
        members: vendoredDependency.members,
      });

      for (const exportPath of Object.values(vendoredDependency.exportValue)) {
        const absoluteExportPath = path.join(
          resolvedPackageDir,
          exportPath.slice('./'.length)
        );

        if (!fs.existsSync(absoluteExportPath)) {
          throw new Error(
            `${packageDir} did not extract required vendored file ${exportPath}.`
          );
        }
      }

      archivesToRemove.push(archivePath);
      delete packageJson.dependencies[dependencyName];
      packageJson.exports ??= {};
      packageJson.exports[vendoredDependency.exportName] =
        vendoredDependency.exportValue;
      rewrites.push({
        field: 'dependencies',
        from: dependencyVersion,
        name: dependencyName,
        to: `embedded:${vendoredDependency.extractedDirectory}`,
      });
    }

    delete packageJson.tuturuuuPublish;
  }

  for (const field of dependencyFields) {
    for (const [dependencyName, dependencyVersion] of Object.entries(
      packageJson[field] ?? {}
    )) {
      if (
        typeof dependencyVersion === 'string' &&
        dependencyVersion.startsWith('file:')
      ) {
        throw new Error(
          `${packageDir} cannot publish ${field}.${dependencyName} as ` +
            `${dependencyVersion}; embed the vendored dependency or publish it ` +
            'as an installable registry package.'
        );
      }
    }
  }

  if (rewrites.length > 0) {
    writeJson(packageJsonPath, packageJson);
  }

  for (const archivePath of archivesToRemove) {
    fs.rmSync(archivePath);
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
  extractVendoredTarball,
  getWorkspaceVersions,
  preparePackageManifest,
  resolveWorkspaceDependencyVersion,
};
