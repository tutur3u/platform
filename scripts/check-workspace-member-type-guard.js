#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const API_DIR_RELATIVE_PATHS = [
  'apps/web/src/app/api',
  'packages/apis/src',
];

const CALLER_USER_PATTERNS = [
  'user.id',
  'context.user.id',
  'ctx.user.id',
  'session.user.id',
  'authorized.user.id',
  'auth.user.id',
  'userId',
];

function collectTsFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectTsFiles(fullPath));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function hasCallerMembershipCheck(source) {
  if (!source.includes("from('workspace_members')")) {
    return false;
  }

  if (!source.includes(".eq('ws_id'")) {
    return false;
  }

  return CALLER_USER_PATTERNS.some((pattern) =>
    source.includes(`.eq('user_id', ${pattern})`)
  );
}

function hasMemberTypeEnforcement(source) {
  if (source.includes('verifyWorkspaceMembershipType(')) {
    return true;
  }

  const normalized = source.replace(/\s+/g, ' ');

  return (
    normalized.includes(".eq('type', 'MEMBER')") ||
    normalized.includes('.eq("type", "MEMBER")') ||
    normalized.includes(".eq('type', \"MEMBER\")") ||
    normalized.includes('.eq("type", \'MEMBER\')')
  );
}

function findViolations(root = REPO_ROOT) {
  const baseDirs = API_DIR_RELATIVE_PATHS.map((relativePath) =>
    path.join(root, relativePath)
  );
  const violations = [];

  for (const dir of baseDirs) {
    if (!fs.existsSync(dir)) {
      continue;
    }

    const files = collectTsFiles(dir);
    for (const filePath of files) {
      const source = fs.readFileSync(filePath, 'utf8');

      if (!hasCallerMembershipCheck(source)) {
        continue;
      }

      if (hasMemberTypeEnforcement(source)) {
        continue;
      }

      violations.push(path.relative(root, filePath));
    }
  }

  return violations.sort((left, right) => left.localeCompare(right));
}

function run() {
  const violations = findViolations(REPO_ROOT);

  if (violations.length === 0) {
    process.stdout.write('Workspace membership type guard check passed.\n');
    return;
  }

  const lines = [
    'Workspace membership type guard check failed.',
    'The following API files perform caller workspace membership checks without MEMBER enforcement:',
    ...violations.map((filePath) => ` - ${filePath}`),
    '',
    "Use verifyWorkspaceMembershipType(...) or add .eq('type', 'MEMBER') to the caller check.",
  ];

  process.stderr.write(`${lines.join('\n')}\n`);
  process.exitCode = 1;
}

if (require.main === module) {
  run();
}

module.exports = {
  findViolations,
  hasCallerMembershipCheck,
  hasMemberTypeEnforcement,
};
