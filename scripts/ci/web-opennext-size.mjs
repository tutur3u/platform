import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// Whole-upload size gate for an apps/web OpenNext family Worker. Input is the
// `wrangler deploy --dry-run --outdir <dir>` output: every module the upload
// carries. Cloudflare limits the compressed Worker at 10 MiB; the family
// budget keeps 0.5 MiB of headroom for drift between builds.
export const BUDGET_MIB = 9.5;
const MIB = 1024 ** 2;
const SKIP = /(?:\.map|README\.md)$/u;

function modules(root) {
  const result = [];
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error(`Symlink in upload: ${path}`);
      if (stat.isDirectory()) visit(path);
      else if (!SKIP.test(name)) result.push(path);
    }
  }
  visit(root);
  return result;
}

/** Wrangler's own `gzip:` figure in KiB from its dry-run log, or null. */
export function wranglerGzipKiB(log) {
  const match = /Total Upload:[^\n]*gzip:\s*([\d.]+)\s*KiB/u.exec(log);
  return match ? Number(match[1]) : null;
}

/**
 * Measures the upload: the gzip of all modules together and the sum of their
 * individual gzip sizes. The gate uses the larger value and wrangler's figure
 * when a log is given, so no single estimate can pass an oversized upload.
 */
export function measureUpload(outdir, log = null) {
  const root = resolve(outdir);
  const files = modules(root);
  if (files.length === 0) throw new Error(`No modules in ${root}`);
  const buffers = files.map((path) => readFileSync(path));
  const rawBytes = buffers.reduce((total, data) => total + data.length, 0);
  const wholeGzipBytes = gzipSync(Buffer.concat(buffers)).length;
  const perFileGzipBytes = buffers.reduce(
    (total, data) => total + gzipSync(data).length,
    0
  );
  const wranglerKiB = log === null ? null : wranglerGzipKiB(log);
  const gatedBytes = Math.max(
    wholeGzipBytes,
    perFileGzipBytes,
    wranglerKiB === null ? 0 : Math.round(wranglerKiB * 1024)
  );
  return {
    files: files.map((path) => relative(root, path)),
    rawBytes,
    wholeGzipBytes,
    perFileGzipBytes,
    wranglerGzipKiB: wranglerKiB,
    gatedMiB: Number((gatedBytes / MIB).toFixed(3)),
    budgetMiB: BUDGET_MIB,
  };
}

function main(argv) {
  const [outdir, ...rest] = argv;
  if (!outdir)
    throw new Error(
      'usage: web-opennext-size.mjs <outdir> [--log <dry-run.log>] [--receipt <file>]'
    );
  let log = null;
  let receiptPath = null;
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--log') log = readFileSync(rest[(index += 1)], 'utf8');
    else if (rest[index] === '--receipt') receiptPath = rest[(index += 1)];
    else throw new Error(`Unknown option ${rest[index]}`);
  }
  const result = measureUpload(outdir, log);
  const { files, ...summary } = result;
  console.log(JSON.stringify({ ...summary, fileCount: files.length }, null, 2));
  if (receiptPath)
    writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`);
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
