/* biome-ignore-all lint/suspicious/noUndeclaredEnvVars: standalone CI-only scripts never run in Turbo or cache signing inputs */
import { appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validatePublicConfig } from './public-config.mjs';

try {
  const config = validatePublicConfig(
    JSON.parse(process.env.DESKTOP_PUBLIC_CONFIG ?? '')
  );
  if (!process.env.RUNNER_TEMP || !process.env.GITHUB_OUTPUT)
    throw new Error('CI runner required');
  await writeFile(
    join(process.env.RUNNER_TEMP, 'desktop-public.json'),
    `${JSON.stringify(config)}\n`,
    { mode: 0o600 }
  );
  await appendFile(process.env.GITHUB_OUTPUT, 'configured=true\n');
} catch {
  process.stderr.write(
    'Desktop public configuration is missing or invalid. Configure DESKTOP_PUBLIC_CONFIG in the desktop-beta environment.\n'
  );
  process.exitCode = 1;
}
