const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
function violations(source) {
  const stagingPatterns = source.match(/const STAGING_HOST[\s\S]*?;/g) ?? [];
  if (
    stagingPatterns.some((pattern) =>
      pattern.replaceAll('\\.', '.').includes('tuturuuu.com')
    )
  ) {
    return ['production cookie domain in STAGING_HOST allowlist'];
  }
  return (source.match(/(?:[a-z0-9_*-]+\.)*tuturuuu\.com\b/gi) ?? []).filter(
    (host) =>
      host
        .toLowerCase()
        .split(/[.-]/)
        .some((part) =>
          /^(staging|beta|cutover|dev|test|qa|next|rc|sandbox|canary|preview)$/.test(
            part
          )
        )
  );
}
function check() {
  const files = execFileSync('git', ['ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 8388608,
  }).split('\0');
  const failures = [];
  for (const file of files) {
    if (!/^(apps|packages|scripts|\.github)\//.test(file)) continue;
    if (/\.(test|spec)\.|\/(__tests__|fixtures)\/|\.(md|mdx)$/.test(file))
      continue;
    if (!/\.(?:[cm]?[jt]sx?|jsonc?|toml|ya?ml|env)$/.test(file)) continue;
    for (const host of violations(readFileSync(file, 'utf8'))) {
      const deadInventory = [
        'apps/infrastructure/src/lib/infrastructure/projects.ts',
        'apps/web/src/lib/infrastructure/project-model.ts',
        'scripts/watch-blue-green/projects.js',
      ].includes(file);
      if (
        deadInventory &&
        ['staging', 'canary'].some((label) => host === label + '.tuturuuu.com')
      )
        continue;
      failures.push(file + ': ' + host);
    }
  }
  return failures;
}
if (require.main === module) {
  const failures = check();
  if (failures.length) {
    console.error('Use <app>.staging.tutur3u.com:\n' + failures.join('\n'));
    process.exitCode = 1;
  }
}
module.exports = { violations, check };
