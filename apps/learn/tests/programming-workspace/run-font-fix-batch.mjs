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
    timeout: 180000,
  });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
