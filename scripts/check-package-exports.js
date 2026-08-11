#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const GENERATED_EXPORT_ROOTS = new Set(['dist']);

function collectExportTargets(exportsValue, exportKey = '.') {
  if (typeof exportsValue === 'string') {
    return [{ exportKey, target: exportsValue }];
  }

  if (Array.isArray(exportsValue)) {
    return exportsValue.flatMap((value) =>
      collectExportTargets(value, exportKey)
    );
  }

  if (!exportsValue || typeof exportsValue !== 'object') {
    return [];
  }

  return Object.entries(exportsValue).flatMap(([key, value]) =>
    collectExportTargets(value, key.startsWith('.') ? key : exportKey)
  );
}

function getWildcardBaseDirectory(target) {
  const wildcardIndex = target.indexOf('*');
  const prefix = target.slice(0, wildcardIndex);
  return prefix.endsWith('/') ? prefix : path.dirname(prefix);
}

function isGeneratedExportTarget(target) {
  const [firstSegment] = target.replace(/^\.\//u, '').split('/');
  return GENERATED_EXPORT_ROOTS.has(firstSegment);
}

function checkPackageExports(manifestPath) {
  const packageDir = path.dirname(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const packageName = manifest.name ?? path.basename(packageDir);

  if (typeof manifest.version !== 'string' || !manifest.exports) {
    return [];
  }

  return collectExportTargets(manifest.exports).flatMap(
    ({ exportKey, target }) => {
      if (!target.startsWith('./') || isGeneratedExportTarget(target)) {
        return [];
      }

      if (target.includes('*')) {
        const baseDirectory = getWildcardBaseDirectory(target);
        const resolvedBase = path.resolve(packageDir, baseDirectory);
        if (
          fs.existsSync(resolvedBase) &&
          fs.statSync(resolvedBase).isDirectory()
        ) {
          return [];
        }

        return [
          {
            exportKey,
            packageName,
            target,
            type: 'missing-wildcard-base',
          },
        ];
      }

      const resolvedTarget = path.resolve(packageDir, target);
      if (fs.existsSync(resolvedTarget)) {
        return [];
      }

      return [
        {
          exportKey,
          packageName,
          target,
          type: 'missing-target',
        },
      ];
    }
  );
}

function findVersionedWorkspacePackageManifests(rootDir = ROOT_DIR) {
  const packagesDir = path.join(rootDir, 'packages');
  if (!fs.existsSync(packagesDir)) return [];

  return fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesDir, entry.name, 'package.json'))
    .filter((manifestPath) => fs.existsSync(manifestPath))
    .filter((manifestPath) => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      return typeof manifest.version === 'string';
    })
    .sort();
}

function checkWorkspacePackageExports(rootDir = ROOT_DIR) {
  return findVersionedWorkspacePackageManifests(rootDir).flatMap(
    checkPackageExports
  );
}

function formatPackageExportViolation(violation) {
  const reason =
    violation.type === 'missing-wildcard-base'
      ? 'wildcard base directory is missing'
      : 'target is missing';
  return `${violation.packageName} export ${JSON.stringify(violation.exportKey)} -> ${JSON.stringify(violation.target)}: ${reason}`;
}

function main() {
  const violations = checkWorkspacePackageExports();
  if (violations.length > 0) {
    console.error(
      [
        'Package export validation failed:',
        ...violations.map(formatPackageExportViolation),
      ].join('\n')
    );
    process.exitCode = 1;
    return;
  }

  console.log('Package export validation passed.');
}

if (require.main === module) {
  main();
}

module.exports = {
  checkPackageExports,
  checkWorkspacePackageExports,
  collectExportTargets,
  findVersionedWorkspacePackageManifests,
  formatPackageExportViolation,
  getWildcardBaseDirectory,
};
