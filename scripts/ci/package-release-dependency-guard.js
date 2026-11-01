#!/usr/bin/env node

/**
 * Published-package dependency guard.
 *
 * A package with a `.github/workflows/release-*-package.yaml` is published to
 * npm. Its `dependencies`, `peerDependencies` and `optionalDependencies` are
 * installed by consumers, so a workspace dependency that is private or has no
 * release workflow of its own makes the published version uninstallable (npm
 * answers 404 for the dependency). `@tuturuuu/ui` and `@tuturuuu/internal-api`
 * shipped broken that way via `@tuturuuu/realtime` and `@tuturuuu/turnstile`.
 *
 * Fix a violation by releasing the dependency (add a release workflow), moving
 * the needed code into an already-published package, or demoting the
 * dependency to `devDependencies` when published code does not need it.
 */

const path = require('node:path');
const {
  getPublishableWorkspacePackages,
  getWorkspacePackages,
} = require('./package-release-readiness.js');

const REPO_ROOT = path.resolve(__dirname, '../..');
const INSTALLED_DEPENDENCY_FIELDS = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
];

function findViolations(repoRoot = REPO_ROOT) {
  const workspacePackages = getWorkspacePackages(repoRoot);
  const publishedPackages = getPublishableWorkspacePackages(repoRoot);
  const violations = [];

  for (const [packageName, published] of publishedPackages) {
    for (const field of INSTALLED_DEPENDENCY_FIELDS) {
      for (const dependencyName of Object.keys(
        published.packageJson[field] ?? {}
      )) {
        const dependency = workspacePackages.get(dependencyName);

        if (!dependency) continue;

        if (dependency.packageJson.private === true) {
          violations.push({
            dependencyName,
            field,
            packageName,
            reason: 'is private',
          });
        } else if (!publishedPackages.has(dependencyName)) {
          violations.push({
            dependencyName,
            field,
            packageName,
            reason: 'has no release-*-package.yaml workflow',
          });
        }
      }
    }
  }

  return violations.sort((left, right) =>
    `${left.packageName}:${left.dependencyName}`.localeCompare(
      `${right.packageName}:${right.dependencyName}`
    )
  );
}

function formatViolation({ dependencyName, field, packageName, reason }) {
  return `${packageName} ${field} -> ${dependencyName} ${reason}`;
}

function run() {
  const violations = findViolations(REPO_ROOT);

  if (violations.length === 0) {
    process.stdout.write('Published package dependency guard passed.\n');
    return;
  }

  process.stderr.write(
    [
      'Published packages must not depend on private or unreleased workspace packages:',
      ...violations.map((violation) => `  - ${formatViolation(violation)}`),
      '',
      'Release the dependency, move the code into a published package, or make it a devDependency.',
      '',
    ].join('\n')
  );
  process.exitCode = 1;
}

if (require.main === module) {
  run();
}

module.exports = { findViolations, formatViolation };
