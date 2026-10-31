// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Direct CI entrypoint; credentials never enter Turbo builds.
// Seals the Web Start candidate for the Cloudflare-only staging publisher. The
// artifact digest binds the exact Worker bytes that the Worker admission must
// name.
//
//   prepare  <sha>                          # credential-free
//   restored <sha>                          # recreate the Void pointer, verify
//   verify   <sha>                          # byte and profile re-verification
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { artifactDigest, prepare, verify } from './wave1-native-artifact.mjs';

export const WEB_APP_ROOT = 'apps/web/cloudflare';

function report(env, receipt) {
  const digest = artifactDigest(receipt);
  if (env.GITHUB_OUTPUT)
    appendFileSync(env.GITHUB_OUTPUT, `artifact_sha256=${digest}\n`);
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      `## Web issuer artifact\n\n- sourceSha: \`${receipt.sha}\`\n- artifactSha256: \`${digest}\`\n\nAdmit exactly this artifact in WAVE1_STAGING_PUBLICATION_ADMISSION (app \`web\`), then re-run failed jobs.\n`
    );
  return digest;
}

export function main(
  argv = process.argv.slice(2),
  env = process.env,
  root = WEB_APP_ROOT
) {
  const [mode, sha] = argv;
  if (mode === 'prepare') {
    assert.ok(
      !env.CLOUDFLARE_STAGING_API_TOKEN,
      'Sealing is credential-free'
    );
    return report(env, prepare(root, 'web', 'staging', undefined, sha));
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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(`Web issuer artifact ${main()}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Web seal failed');
    process.exitCode = 1;
  }
}
