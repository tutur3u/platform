// Reads the serializable Worker options (`mounts`, `worker`) from an app's
// start-bridge.config.ts. The file is TypeScript that may import the bridge,
// so it is evaluated in a Node subprocess with native type stripping, keeping
// the plan synchronous. A missing file is the codemod's empty default.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function readAppConfig(file, spawn = spawnSync) {
  if (!fs.existsSync(file)) return { config: {} };
  const script = `const { default: config = {} } = await import(${JSON.stringify(
    pathToFileURL(file).href
  )});
process.stdout.write(JSON.stringify({ mounts: config.mounts, worker: config.worker }));`;
  const result = spawn(
    process.execPath,
    ['--input-type=module', '--no-warnings', '-e', script],
    { encoding: 'utf8', timeout: 30000 }
  );
  if (result.status !== 0)
    return {
      error: `could not be loaded with Node type stripping: ${
        (result.stderr ?? '')
          .trim()
          .split('\n')
          .find((line) => /Error/u.test(line)) ?? `exit ${result.status}`
      }`,
    };
  return { config: JSON.parse(result.stdout || '{}') };
}
