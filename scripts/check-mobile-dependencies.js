#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const MOBILE_PUBSPEC_PATH = path.join(ROOT_DIR, 'apps/mobile/pubspec.yaml');
const MOBILE_PUBSPEC_LOCK_PATH = path.join(
  ROOT_DIR,
  'apps/mobile/pubspec.lock'
);

const APPLE_CI_COMPATIBILITY_RULES = [
  {
    firstIncompatibleVersion: '7.1.1',
    packageName: 'connectivity_plus',
    requiredConstraint: '7.0.0',
    requiredLockVersion: '7.0.0',
    reason:
      'connectivity_plus 7.1.1 uses NWPath.isUltraConstrained, which fails the current Xcode 16.4 iOS/macOS CI SDK builds.',
  },
  {
    firstIncompatibleVersion: '12.4.0',
    packageName: 'device_info_plus',
    requiredConstraint: '12.3.0',
    requiredLockVersion: '12.3.0',
    reason:
      'device_info_plus 12.4.0 uses NSProcessInfo.isiOSAppOnVision, which fails the current Xcode 16.4 iOS simulator CI SDK build.',
  },
];

function normalizeVersion(version) {
  return version
    .split(/[+-]/, 1)[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(left, right) {
  const leftParts = normalizeVersion(left);
  const rightParts = normalizeVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

function stripInlineComment(value) {
  const commentIndex = value.indexOf('#');
  const rawValue = commentIndex === -1 ? value : value.slice(0, commentIndex);
  return rawValue.trim().replace(/^['"]|['"]$/g, '');
}

function getDirectDependencyConstraint(pubspecText, packageName) {
  const lines = pubspecText.split(/\r?\n/);
  let inDependencies = false;

  for (const line of lines) {
    if (/^dependencies:\s*$/.test(line)) {
      inDependencies = true;
      continue;
    }

    if (inDependencies && /^[^\s].*:\s*$/.test(line)) {
      return null;
    }

    if (!inDependencies) continue;

    const match = line.match(new RegExp(`^\\s{2}${packageName}:\\s*(.*)$`));
    if (match) {
      return stripInlineComment(match[1]);
    }
  }

  return null;
}

function getLockedPackageVersion(lockText, packageName) {
  const lines = lockText.split(/\r?\n/);
  const packageHeader = `  ${packageName}:`;

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== packageHeader) continue;

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^ {2}[^\s].*:\s*$/.test(lines[cursor])) {
        break;
      }

      const versionMatch = lines[cursor].match(
        /^\s{4}version:\s*"?([^"]+)"?\s*$/
      );
      if (versionMatch) {
        return versionMatch[1];
      }
    }
  }

  return null;
}

function collectMobileDependencyCompatibilityIssues({
  lockText,
  pubspecText,
  rules = APPLE_CI_COMPATIBILITY_RULES,
}) {
  const issues = [];

  for (const rule of rules) {
    const constraint = getDirectDependencyConstraint(
      pubspecText,
      rule.packageName
    );
    const lockedVersion = getLockedPackageVersion(lockText, rule.packageName);

    if (constraint !== rule.requiredConstraint) {
      issues.push(
        [
          `apps/mobile/pubspec.yaml must pin ${rule.packageName} to ${rule.requiredConstraint}.`,
          `Found: ${constraint ?? 'missing'}.`,
          rule.reason,
        ].join(' ')
      );
    }

    if (!lockedVersion) {
      issues.push(
        `apps/mobile/pubspec.lock is missing ${rule.packageName}; update the mobile dependency compatibility rule if this dependency was intentionally removed.`
      );
      continue;
    }

    if (lockedVersion !== rule.requiredLockVersion) {
      issues.push(
        [
          `apps/mobile/pubspec.lock must resolve ${rule.packageName} ${rule.requiredLockVersion}.`,
          `Found: ${lockedVersion}.`,
          rule.reason,
        ].join(' ')
      );
      continue;
    }

    if (compareVersions(lockedVersion, rule.firstIncompatibleVersion) >= 0) {
      issues.push(
        [
          `apps/mobile/pubspec.lock resolves ${rule.packageName} ${lockedVersion}, which is known incompatible with Apple CI.`,
          rule.reason,
        ].join(' ')
      );
    }
  }

  return issues;
}

function main() {
  const pubspecText = fs.readFileSync(MOBILE_PUBSPEC_PATH, 'utf8');
  const lockText = fs.readFileSync(MOBILE_PUBSPEC_LOCK_PATH, 'utf8');
  const issues = collectMobileDependencyCompatibilityIssues({
    lockText,
    pubspecText,
  });

  if (issues.length > 0) {
    console.error('Mobile dependency compatibility check failed:');
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log('Mobile dependency compatibility checks passed.');
}

if (require.main === module) {
  main();
}

module.exports = {
  APPLE_CI_COMPATIBILITY_RULES,
  collectMobileDependencyCompatibilityIssues,
  compareVersions,
  getDirectDependencyConstraint,
  getLockedPackageVersion,
};
