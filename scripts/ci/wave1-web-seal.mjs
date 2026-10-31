// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Direct CI entrypoint; credentials never enter Turbo builds.
// Seals the Web Start candidate with the verified Next fallback (design §2.2).
// The fallback origin is a sealed var, so the artifact digest binds the exact
// Worker/Next pair that the Worker admission must name.
//
//   prepare  <sha> <deploymentId> <origin>  # after next-verify, credential-free
//   restored <sha>                          # recreate the Void pointer, verify
//   verify   <sha>                          # byte and profile re-verification
//
// Append `--dry-run` to print the intended actions; nothing is read or written.
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseDryRunArgs } from './dry-run-args.mjs';
import { artifactDigest, prepare, verify } from './wave1-native-artifact.mjs';

export const WEB_APP_ROOT = 'apps/web/cloudflare';

function report(env, receipt) {
  const digest = artifactDigest(receipt);
  const { deploymentId, origin } = receipt.profile.nextFallback;
  if (env.GITHUB_OUTPUT)
    appendFileSync(env.GITHUB_OUTPUT, `artifact_sha256=${digest}\n`);
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      `## Web issuer artifact\n\n- sourceSha: \`${receipt.sha}\`\n- artifactSha256: \`${digest}\`\n- nextDeploymentId: \`${deploymentId}\`\n- NEXT_FALLBACK_ORIGIN: \`${origin}\`\n\nAdmit exactly this pair in WAVE1_STAGING_PUBLICATION_ADMISSION (app \`web\`), then re-run failed jobs.\n`
    );
  return digest;
}

export function main(
  argv = process.argv.slice(2),
  env = process.env,
  root = WEB_APP_ROOT
) {
  const [mode, sha, deploymentId, origin] = argv;
  if (mode === 'prepare') {
    assert.ok(
      !env.CLOUDFLARE_STAGING_API_TOKEN && !env.VERCEL_TOKEN_WEB_STAGING,
      'Sealing is credential-free'
    );
    return report(
      env,
      prepare(root, 'web', 'staging', undefined, sha, { deploymentId, origin })
    );
  }
  if (mode === 'restored') {
    // The archive carries dist and the seal; restore the Void pointer the
    // emitted workerd suite reads, derived only from the sealed receipt.
    const { receipt } = verify(root, 'web', 'staging', sha);
    const pointer = resolve(root, '.wrangler/deploy/config.json');
    mkdirSync(dirname(pointer), { recursive: true });
    writeFileSync(
      pointer,
      JSON.stringify({
        auxiliaryWorkers: [],
        configPath: `../../dist/${receipt.emitted}`,
      })
    );
    return report(env, receipt);
  }
  if (mode === 'verify')
    return report(env, verify(root, 'web', 'staging', sha).receipt);
  throw new Error(`Unknown mode ${mode}`);
}

// Prints the intended actions without touching the filesystem (`--dry-run`).
export function describeSealPlan(argv, root = WEB_APP_ROOT) {
  const [mode, sha, deploymentId, origin] = argv;
  if (mode === 'prepare')
    return [
      `[dry-run] Would seal the Web Start candidate under ${root}:`,
      `  - bind source ${sha} to Next deployment ${deploymentId} at ${origin}`,
      '  - write the sealed artifact and append artifact_sha256 to $GITHUB_OUTPUT',
      '  - require no CLOUDFLARE_STAGING_API_TOKEN / VERCEL_TOKEN_WEB_STAGING',
      '[dry-run] Nothing was written.',
    ];
  if (mode === 'restored')
    return [
      `[dry-run] Would verify the seal for ${sha} under ${root} and recreate ${root}/.wrangler/deploy/config.json`,
      '[dry-run] Nothing was written.',
    ];
  if (mode === 'verify')
    return [
      `[dry-run] Would re-verify the sealed artifact bytes and profile for ${sha} under ${root}`,
      '[dry-run] Nothing was read or written.',
    ];
  throw new Error(`Unknown mode ${mode}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const cli = parseDryRunArgs(process.argv.slice(2));
    if (cli.dryRun)
      for (const line of describeSealPlan(cli.args)) console.log(line);
    else console.log(`Web issuer artifact ${main()}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Web seal failed');
    process.exitCode = 1;
  }
}
