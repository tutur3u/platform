import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAssetKeys } from './asset-mapping.mjs';

export function packageAssets(root) {
  const client = join(root, 'dist/client');
  for (const path of [root, join(root, 'dist'), client]) {
    if (!fs.lstatSync(path).isDirectory())
      throw new Error('Require real build directories');
  }
  const keys = [];
  let bytes = 0;
  function walk(path, prefix = '') {
    for (const name of fs.readdirSync(path)) {
      const key = `${prefix}${name}`;
      const stat = fs.lstatSync(join(path, name));
      if (stat.isDirectory()) walk(join(path, name), `${key}/`);
      else {
        if (!stat.isFile() || stat.nlink !== 1)
          throw new Error('Require single-link client files');
        keys.push(key);
        bytes += stat.size;
        if (keys.length > 10000 || bytes > 100 * 1024 * 1024)
          throw new Error('Client asset bounds exceeded');
      }
    }
  }
  walk(client);
  if (fs.existsSync(join(client, 'roadmap')))
    throw new Error('Client mount already exists; require a fresh build');
  assertAssetKeys(keys.map((key) => `roadmap/${key}`));
  const names = fs.readdirSync(client);
  fs.mkdirSync(join(client, 'roadmap'));
  for (const name of names)
    fs.renameSync(join(client, name), join(client, 'roadmap', name));
  return keys.map((key) => `roadmap/${key}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  packageAssets(fileURLToPath(new URL('../', import.meta.url)));
}
