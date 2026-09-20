const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const FORMAT = 1;
const INPUTS = [
  'apps/database/supabase/config.toml',
  'apps/database/supabase/migrations',
  'apps/database/supabase/seed.sql',
  'apps/database/supabase/seeds',
  'apps/database/package.json',
  'apps/database/scripts/run-supabase.js',
  'scripts/ci/supabase-baseline-key.js',
  'scripts/ci/supabase-baseline.js',
];

function inputFiles(root, inputs = INPUTS) {
  const files = [];
  function visit(relative) {
    const absolute = path.join(root, relative);
    let stat;
    try {
      stat = fs.lstatSync(absolute);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (stat.isSymbolicLink())
      throw new Error(`Baseline input is a symlink: ${relative}`);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolute).sort())
        visit(`${relative}/${entry}`);
    } else if (stat.isFile()) files.push(relative);
  }
  inputs.forEach(visit);
  return files.sort();
}

function baselineKey({
  root,
  cliVersion,
  services,
  arch,
  platform,
  seedEpoch,
}) {
  if (!cliVersion || !arch || !platform || !services.length) {
    throw new Error('Missing baseline runtime identity');
  }
  const hash = createHash('sha256');
  hash.update(
    JSON.stringify({
      format: FORMAT,
      cliVersion,
      seedEpoch,
      arch,
      platform,
      services: services
        .map(({ name, local }) => ({ name, local }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    })
  );
  for (const name of inputFiles(root)) {
    const content = fs.readFileSync(path.join(root, name));
    hash.update(`\0${name}\0${content.length}\0`);
    hash.update(content);
  }
  return `supabase-baseline-v${FORMAT}-${platform}-${arch}-${hash.digest('hex')}`;
}

function migrationVersions(root) {
  return fs
    .readdirSync(path.join(root, 'apps/database/supabase/migrations'))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .map((name) => name.split('_')[0])
    .sort();
}

function validateManifest(manifest, { key, image, checksum }) {
  return (
    manifest?.format === FORMAT &&
    manifest.key === key &&
    manifest.image === image &&
    manifest.checksum === checksum
  );
}

module.exports = {
  FORMAT,
  INPUTS,
  baselineKey,
  inputFiles,
  migrationVersions,
  validateManifest,
};
