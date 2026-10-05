/* biome-ignore-all lint/suspicious/noUndeclaredEnvVars: release identity comes from protected GitHub Actions */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyPublication } from './verify-publication.mjs';

export function provenanceVerificationArgs(path, source) {
  if (!/^[a-f0-9]{40}$/.test(source)) {
    throw new Error('Provenance verification requires an exact source SHA');
  }
  return [
    'attestation',
    'verify',
    path,
    '--repo',
    'tutur3u/platform',
    '--signer-workflow',
    'tutur3u/platform/.github/workflows/desktop-beta.yaml',
    '--source-ref',
    'refs/heads/production',
    '--source-digest',
    source,
    '--deny-self-hosted-runners',
  ];
}

export async function verifyProvenance(
  directory,
  source,
  run,
  platforms,
  verify
) {
  const files = await verifyPublication(directory, source, run, platforms);
  for (const { name } of files) {
    await verify(provenanceVerificationArgs(join(directory, name), source));
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await verifyProvenance(
    join(process.env.RUNNER_TEMP, 'desktop-artifacts'),
    process.env.GITHUB_SHA,
    process.env.GITHUB_RUN_ID,
    process.env.DESKTOP_BETA_PLATFORMS,
    (args) => execFileSync('gh', args, { stdio: 'inherit' })
  );
}
