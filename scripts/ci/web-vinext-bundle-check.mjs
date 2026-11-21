import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUDGET_MIB, measureUpload } from './web-opennext-size.mjs';
import { assertBundleOmitsRedis } from './web-opennext-smoke.mjs';

// Build-output gate for an apps/web vinext Worker: no emitted module may be,
// import or embed the real Redis client, and the upload must fit the family
// budget. Input is the Worker bundle of the Cloudflare Build Output
// (`.cloudflare/output/v1/workers/default/bundle`), optionally with the
// `cf deploy --dry-run --prebuilt` log for the provider's own gzip figure.
export const VINEXT_ENTRY = 'index.mjs';

export function checkVinextBundle(bundleDir, log = null) {
  assertBundleOmitsRedis(bundleDir, VINEXT_ENTRY);
  const { files, ...summary } = measureUpload(bundleDir, log);
  return { ...summary, fileCount: files.length, redisFree: true };
}

function main(argv) {
  const [bundleDir, flag, logPath] = argv;
  if (!bundleDir || (flag && flag !== '--log') || (flag && !logPath)) {
    throw new Error(
      'usage: web-vinext-bundle-check.mjs <bundle-dir> [--log <cf-dry-run.log>]'
    );
  }
  const result = checkVinextBundle(
    bundleDir,
    logPath ? readFileSync(logPath, 'utf8') : null
  );
  console.log(JSON.stringify(result, null, 2));
  if (result.gatedMiB > BUDGET_MIB) {
    console.error(
      `Upload is ${result.gatedMiB} MiB gzip, over the ${BUDGET_MIB} MiB family budget.`
    );
    return 1;
  }
  return 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
