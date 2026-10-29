#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function codeOnly(source) {
  return source.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\x60(?:\\.|[^\x60\\])*\x60/g,
    ' '
  );
}

function missingPermissionHelper(source) {
  const code = codeOnly(source);
  return !/\b(?:getPermissions|withSessionAuth|withWorkspaceAuth|requireWorkspacePermission)\s*\(/.test(
    code
  );
}
function digest(source) {
  return crypto.createHash('sha256').update(source).digest('hex');
}
function inventory(root = process.cwd()) {
  const files = execFileSync(
    'git',
    [
      'ls-files',
      '--',
      'apps/*/src/app/api/**/route.*',
      'apps/*/src/legacy-api-routes/**/route.*',
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  )
    .trim()
    .split('\n');
  return files
    .filter((file) =>
      /^apps\/(?!backend\/|tanstack-web\/)[^/]+\/src\/(?:app\/api\/|legacy-api-routes\/).*\/route\.[cm]?[jt]sx?$/.test(
        file
      )
    )
    .flatMap((file) => {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      return missingPermissionHelper(source)
        ? [{ file, digest: digest(source) }]
        : [];
    });
}
function newFindings(entries, baseline) {
  return entries.filter(
    (entry) =>
      !baseline.some(
        (old) => old.file === entry.file && old.digest === entry.digest
      )
  );
}
if (require.main === module) {
  try {
    const root = process.cwd();
    const baseline = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, 'security-route-baseline.json'),
        'utf8'
      )
    );
    const findings = newFindings(inventory(root), baseline);
    if (process.argv[2])
      fs.writeFileSync(
        process.argv[2],
        JSON.stringify({ findings }, null, 2) + '\n'
      );
    for (const finding of findings)
      console.error(
        finding.file +
          ': permission helper not found; inspect delegation or add authorization.'
      );
    console.log(
      'Route permission inventory: ' + findings.length + ' new finding(s).'
    );
    process.exitCode = findings.length ? 1 : 0;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { codeOnly, missingPermissionHelper, inventory, newFindings };
