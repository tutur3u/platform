const fs = require('node:fs');
const path = require('node:path');
const { PAUSED_APP_DIRECTORIES } = require('../paused-runtimes.js');

function readWorkspaces(root) {
  const workspaces = [];
  for (const parent of ['apps', 'packages']) {
    if (!fs.existsSync(path.join(root, parent))) continue;
    for (const entry of fs.readdirSync(path.join(root, parent), {
      withFileTypes: true,
    })) {
      if (
        !entry.isDirectory() ||
        (parent === 'apps' && PAUSED_APP_DIRECTORIES.has(entry.name))
      )
        continue;
      const workspace = `${parent}/${entry.name}`;
      const file = path.join(root, workspace, 'package.json');
      if (!fs.existsSync(file)) continue;
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
      workspaces.push({
        workspace,
        name: manifest.name,
        dependencies: Object.keys({
          ...manifest.dependencies,
          ...manifest.devDependencies,
          ...manifest.peerDependencies,
          ...manifest.optionalDependencies,
        }),
      });
    }
  }
  return workspaces;
}

function reverseDependents(selected, workspaces = []) {
  const affected = new Set(selected);
  const names = new Set(
    workspaces
      .filter((entry) => affected.has(entry.workspace))
      .map((entry) => entry.name)
  );
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const entry of workspaces) {
      if (
        affected.has(entry.workspace) ||
        !entry.dependencies.some((name) => names.has(name))
      )
        continue;
      affected.add(entry.workspace);
      names.add(entry.name);
      expanded = true;
    }
  }
  return affected;
}

function assertSafePaths(files) {
  for (const file of files) {
    if (file.split(/[\\/]/).some((part) => part.startsWith('-'))) {
      throw new Error(
        `Paths with option-like components are not supported: ${JSON.stringify(file)}`
      );
    }
  }
}

module.exports = { readWorkspaces, reverseDependents, assertSafePaths };
