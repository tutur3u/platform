import { dirname, resolve } from 'node:path';

export function assertAssetKeys(keys) {
  if (!keys.length || !keys.some((key) => key.endsWith('.js'))) {
    throw new Error('Client assets are missing');
  }
  for (const key of keys) {
    if (
      !key.startsWith('roadmap/') ||
      /[%\\?#\x00-\x20]/.test(key) ||
      key.split('/').some((part) => !part || part === '.' || part === '..')
    ) {
      throw new Error('Client asset key must map beneath /roadmap/');
    }
  }
}

export function assertEmittedMapping(config, configPath, paths, root) {
  if (
    !config ||
    config.name !== 'tuturuuu-roadmap' ||
    typeof config.main !== 'string' ||
    !config.main ||
    !config.assets ||
    typeof config.assets !== 'object'
  )
    throw new Error('Unexpected emitted Worker identity or assets');
  const assets = config.assets;
  if (assets.base_path !== undefined && assets.base_path !== '/') {
    throw new Error('Provider asset base must be absent or root');
  }
  if (
    typeof assets.directory !== 'string' ||
    !assets.directory ||
    resolve(root, dirname(configPath), assets.directory) !==
      resolve(root, 'dist/client') ||
    assets.binding !== 'ASSETS' ||
    assets.run_worker_first !== true ||
    assets.not_found_handling !== 'none' ||
    (assets.html_handling !== undefined &&
      assets.html_handling !== 'auto-trailing-slash')
  )
    throw new Error('Unexpected emitted asset directory or serving policy');
  const main = resolve(root, dirname(configPath), config.main);
  if (
    !paths.some((path) => resolve(root, path) === main) ||
    !main.startsWith(`${resolve(root, 'dist')}/`)
  ) {
    throw new Error('Emitted Worker entry is missing or outside dist');
  }
  assertAssetKeys(
    paths
      .filter((path) => path.startsWith('dist/client/'))
      .map((path) => path.slice('dist/client/'.length))
  );
}
