#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const { realpathSync, statSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MODES = {
  lint: ['oxlint', '--deny-warnings', '--threads', '2'],
  format: ['oxfmt', '--check', '--threads', '2'],
  write: ['oxfmt', '--write', '--threads', '2'],
};
const EXCLUDED = new Set([
  'node_modules',
  'dist',
  '.next',
  '.open-next',
  'coverage',
  '.worktrees',
  'tmp',
  '.git',
]);

function commandFor(mode, files, root = ROOT) {
  if (!MODES[mode] || !files.length) {
    throw new Error('Usage: bun oxc:<lint|format|write> <owned-file> ...');
  }
  const canonicalRoot = realpathSync(root);
  const selected = files.map((file) => {
    if (file.startsWith('-') || /[*?{}!]/.test(file)) {
      throw new Error(
        `Pass explicit file paths, without flags or globs: ${file}`
      );
    }
    const absolute = realpathSync(path.resolve(root, file));
    const relative = path.relative(canonicalRoot, absolute);
    const segments = relative.split(path.sep);
    if (
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative) ||
      segments.some((segment) => EXCLUDED.has(segment)) ||
      /^(apps\/)(backend|tanstack-web|mobile)(\/|$)/.test(relative) ||
      !statSync(absolute).isFile()
    ) {
      throw new Error(
        `Select an active, repository-owned source file: ${file}`
      );
    }
    return absolute;
  });
  const [tool, ...options] = MODES[mode];
  const config = tool === 'oxlint' ? '.oxlintrc.json' : '.oxfmtrc.json';
  return {
    binary: path.join(root, 'node_modules', '.bin', tool),
    args: ['--config', path.join(root, config), ...options, ...selected],
  };
}

if (require.main === module) {
  try {
    const command = commandFor(process.argv[2], process.argv.slice(3));
    const result = spawnSync(command.binary, command.args, {
      cwd: ROOT,
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { commandFor };
