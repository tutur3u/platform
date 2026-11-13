const fs = require('node:fs');
const map = require('./check-map.json');

function validateMap(value = map) {
  if (value.version !== 1) throw new Error('Unsupported check map version');
  for (const scope of [
    'oxc',
    'i18n',
    'docs',
    'migrations',
    'mobile',
    'plugin',
    'fonts',
  ])
    if (!Object.hasOwn(value.ciScopes, scope))
      throw new Error(`Missing CI scope: ${scope}`);
  for (const id of [
    'docs-audit',
    'sdk-portable',
    'package-release-dependencies',
    'i18n',
    'migration-timestamps',
    'api-route-wrappers',
    'mobile-lucide-sync',
    'mobile-shadcn-ratchet',
    'mobile-api-mappings',
  ])
    if (!Object.hasOwn(value.localChecks, id))
      throw new Error(`Missing local check: ${id}`);
  for (const [name, patterns] of Object.entries(value.ciScopes)) {
    if (
      !/^[a-z][a-z0-9-]*$/.test(name) ||
      !Array.isArray(patterns) ||
      !patterns.length ||
      patterns.some((item) => typeof item !== 'string')
    )
      throw new Error(`Invalid CI scope: ${name}`);
  }
  for (const [id, pattern] of Object.entries(value.localChecks)) {
    if (typeof pattern !== 'string' || !pattern.startsWith('^'))
      throw new Error(`Invalid local check pattern: ${id}`);
    new RegExp(pattern);
  }
  return value;
}

function selectLocalChecks(files, value = map) {
  validateMap(value);
  return new Set(
    Object.entries(value.localChecks)
      .filter(([, pattern]) =>
        files.some((file) => new RegExp(pattern).test(file))
      )
      .map(([id]) => id)
  );
}

function ciFilters(value = map) {
  return validateMap(value).ciScopes;
}

if (require.main === module) {
  if (process.argv.length !== 3 || process.argv[2] !== '--ci-filters')
    throw new Error('Usage: node scripts/ci/check-map.js --ci-filters');
  const filters = JSON.stringify(ciFilters());
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `filters=${filters}\n`);
  console.log(filters);
}

module.exports = { ciFilters, selectLocalChecks, validateMap };
