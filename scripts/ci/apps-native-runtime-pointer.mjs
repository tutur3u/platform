import assert from 'node:assert/strict';
import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { readRegularFileSync } from '../safe-fs.js';

const pointers = [
  '.wrangler/deploy/config.json',
  '.void/preview-deploy-config.json',
];

function metadata(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function contained(root, path) {
  const value = relative(root, path);
  assert.ok(
    value &&
      value !== '..' &&
      !value.startsWith(`..${sep}`) &&
      !isAbsolute(value),
    'Path escaped artifact root'
  );
  assert.equal(realpathSync(path), path, 'Artifact symlink forbidden');
  return path;
}

// Selection mirrors apps-native-artifact.py; sealing/receipt checks stay mandatory.
export function readNativeRuntimeConfig(directory) {
  const app = realpathSync(directory);
  for (const name of pointers) {
    for (
      let parent = dirname(resolve(app, name));
      parent !== app;
      parent = dirname(parent)
    ) {
      const entry = metadata(parent);
      assert.ok(
        !entry || entry.isDirectory(),
        'Redirect ancestor must be a directory, never a symlink'
      );
    }
  }
  const candidates = pointers
    .map((name) => resolve(app, name))
    .filter((path) => metadata(path));
  assert.equal(
    candidates.length,
    1,
    'Exactly one native/saved deploy pointer required'
  );
  const pointer = contained(app, candidates[0]);
  assert.ok(
    lstatSync(pointer).isFile(),
    'Deploy pointer must be a regular file'
  );
  const redirect = JSON.parse(
    readRegularFileSync(pointer, { encoding: 'utf8' })
  );
  assert.ok(
    redirect && typeof redirect === 'object' && !Array.isArray(redirect),
    'Unexpected deploy metadata'
  );
  assert.deepEqual(Object.keys(redirect).sort(), [
    'auxiliaryWorkers',
    'configPath',
  ]);
  assert.deepEqual(redirect.auxiliaryWorkers, []);
  assert.ok(
    typeof redirect.configPath === 'string' &&
      redirect.configPath.length > 0 &&
      !isAbsolute(redirect.configPath) &&
      !/[\\\r\n\0]/.test(redirect.configPath),
    'Emitted path must be relative without control characters'
  );
  const dist = contained(app, resolve(app, 'dist'));
  assert.ok(lstatSync(dist).isDirectory(), 'Missing dist');
  // Void saves unchanged bytes: the saved pointer does not change their base.
  const configPath = contained(
    dist,
    resolve(app, '.wrangler/deploy', redirect.configPath)
  );
  assert.ok(
    lstatSync(configPath).isFile(),
    'Emitted config must be a regular file'
  );
  const config = JSON.parse(
    readRegularFileSync(configPath, { encoding: 'utf8' })
  );
  assert.ok(
    config && typeof config === 'object' && !Array.isArray(config),
    'Invalid config object'
  );
  return { configPath, config };
}
