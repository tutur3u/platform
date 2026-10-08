import assert from 'node:assert/strict';
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { sha256 } from './employee-validation-core.mjs';

// Hash all installed package bytes and resolution edges used by compiler/client.
// Absolute paths are excluded from the portable receipt, but resolution is fresh.
export function dependencyIdentity(root) {
  const roots = ['typescript', '@supabase/supabase-js', '@types/node'];
  const seen = new Map();
  function visit(name, from) {
    const require = createRequire(path.join(from, 'package.json'));
    let packageFile;
    try {
      packageFile = require.resolve(`${name}/package.json`);
    } catch {
      let current = path.dirname(require.resolve(name));
      while (
        !lstatSync(path.join(current, 'package.json'), {
          throwIfNoEntry: false,
        })
      )
        current = path.dirname(current);
      packageFile = path.join(current, 'package.json');
    }
    const directory = realpathSync(path.dirname(packageFile));
    if (seen.has(directory)) return seen.get(directory).key;
    const pkg = JSON.parse(readFileSync(packageFile));
    const entry = {
      key: `${pkg.name}@${pkg.version}`,
      name: pkg.name,
      version: pkg.version,
      files: [],
      dependencies: {},
    };
    seen.set(directory, entry);
    function walk(relative = '') {
      for (const name of readdirSync(path.join(directory, relative)).sort()) {
        if (name === 'node_modules') continue;
        const file = path.join(relative, name),
          target = path.join(directory, file),
          stat = lstatSync(target);
        assert(
          !stat.isSymbolicLink(),
          'Dependency package contains an unreviewed symlink'
        );
        if (stat.isDirectory()) walk(file);
        else if (stat.isFile())
          entry.files.push({
            path: file,
            sha256: sha256(readFileSync(target)),
          });
      }
    }
    walk();
    const dependencies = { ...pkg.dependencies };
    if (pkg.name === 'typescript')
      dependencies[
        `@typescript/typescript-${process.platform}-${process.arch}`
      ] = pkg.version;
    for (const dependency of Object.keys(dependencies).sort())
      entry.dependencies[dependency] = visit(dependency, directory);
    return entry.key;
  }
  const resolvedRoots = Object.fromEntries(
    roots.map((name) => [name, visit(name, root)])
  );
  const packages = [...seen.values()].sort((a, b) =>
    a.key.localeCompare(b.key)
  );
  return {
    version: 1,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    nodeBinarySha256: sha256(readFileSync(process.execPath)),
    lockSha256: sha256(readFileSync(path.join(root, 'bun.lock'))),
    rootPackageSha256: sha256(readFileSync(path.join(root, 'package.json'))),
    roots: resolvedRoots,
    packages,
  };
}
export function verifyDependencies(root, expected) {
  assert.deepEqual(
    dependencyIdentity(root),
    expected,
    'Frozen compiler/client dependency identity changed'
  );
}
