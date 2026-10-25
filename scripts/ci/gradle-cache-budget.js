const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAX_BYTES = 512 * 1024 ** 2;
const CACHE_PATHS = [
  '.gradle/wrapper/dists',
  '.gradle/caches/modules-2/files-2.1',
];

function downloadCacheBudget(home) {
  let bytes = 0;
  function visit(file) {
    if (!fs.existsSync(file)) return;
    const stat = fs.lstatSync(file);
    // Include tar headers/padding; never follow links outside the download tree.
    bytes += 1024 + Math.ceil(stat.size / 512) * 512;
    if (stat.isDirectory())
      for (const name of fs.readdirSync(file)) visit(path.join(file, name));
  }
  for (const relative of CACHE_PATHS) visit(path.join(home, relative));
  return { bytes, save: bytes > 0 && bytes <= MAX_BYTES };
}

if (require.main === module) {
  const result = downloadCacheBudget(os.homedir());
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `save=${result.save}\nbytes=${result.bytes}\n`
  );
  console.log(
    `Gradle download cache: ${result.bytes} bytes; 512 MiB budget; save=${result.save}`
  );
  if (!result.save)
    console.log('::notice::Skipping empty or over-budget Gradle cache save.');
}

module.exports = { CACHE_PATHS, MAX_BYTES, downloadCacheBudget };
