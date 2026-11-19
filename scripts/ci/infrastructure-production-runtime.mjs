import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export async function runInfrastructureProductionRuntime(
  appRoot,
  sha,
  execute = promisify(execFile)
) {
  assert.match(sha ?? '', /^[a-f0-9]{40}$/u);
  assert.ok(!process.env.CLOUDFLARE_API_TOKEN, 'Provider credential forbidden');
  const result = await execute(
    process.execPath,
    [
      '--test',
      'cloudflare/production.runtime.mjs',
      'cloudflare/build-info-admin.runtime.mjs',
    ],
    {
      cwd: appRoot,
      env: {
        ...process.env,
        CI: 'true',
        CI_SOURCE_SHA: sha,
        INFRASTRUCTURE_ARTIFACT_PROFILE: 'production',
      },
      timeout: 240000,
      maxBuffer: 4 * 1024 * 1024,
    }
  ).catch((error) => {
    if (error.stdout) process.stdout.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    throw error;
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}
