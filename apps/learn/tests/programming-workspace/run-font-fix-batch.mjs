import { spawnSync } from 'node:child_process';
import path from 'node:path';

const dir = import.meta.dirname;
for (const name of ['run-geometry.mjs', 'run-ui.mjs']) {
  const env = { ...process.env };
  delete env.QA_BEFORE;
  if (name === 'run-ui.mjs') env.QA_SKIP_TYPES = '1';
  else delete env.QA_SKIP_TYPES;
  const result = spawnSync(process.execPath, [path.join(dir, name)], {
    env,
    stdio: 'inherit',
    // Each child has a 600s work budget plus up to 120s teardown.
    timeout: 750000,
  });
  if (result.status !== 0) {
    if (result.status === null)
      console.error(
        `${name} terminated: signal=${result.signal ?? 'none'} error=${result.error?.message ?? 'none'}`
      );
    process.exitCode = result.status ?? 1;
    break;
  }
}
