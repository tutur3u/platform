const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function registryRewrites(rewrites) {
  return rewrites.filter(({ field }) =>
    ['dependencies', 'peerDependencies', 'optionalDependencies'].includes(field)
  );
}

function requireInstalledDependencies(manifest, consumer, lock) {
  for (const field of [
    'dependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    for (const name of Object.keys(manifest[field] || {})) {
      const entry = lock.packages?.[`node_modules/${name}`];
      const directory = path.join(consumer, 'node_modules', name);
      const installed = path.join(directory, 'package.json');
      if (
        !entry?.version ||
        entry.link ||
        !/^sha(?:512|1)-[A-Za-z0-9+/=]+$/.test(entry.integrity || '') ||
        !entry.resolved?.startsWith('https://registry.npmjs.org/') ||
        !fs.existsSync(installed) ||
        fs.lstatSync(directory).isSymbolicLink()
      ) {
        throw new Error(`INSTALLED_DEPENDENCY_MISSING: ${name}`);
      }
      const actual = JSON.parse(fs.readFileSync(installed, 'utf8'));
      if (actual.name !== name || actual.version !== entry.version)
        throw new Error(`INSTALLED_DEPENDENCY_MISMATCH: ${name}`);
    }
  }
}

function workflowPhase(env) {
  if (env.GITHUB_EVENT_NAME !== 'pull_request') return 'public';
  const event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  const pr = event.pull_request;
  return pr?.head?.repo?.full_name === env.GITHUB_REPOSITORY &&
    pr?.base?.repo?.full_name === env.GITHUB_REPOSITORY &&
    pr?.head?.ref === 'release-please--branches--production' &&
    pr?.base?.ref === 'production'
    ? 'source'
    : 'public';
}

function verifyPublishReceipt({ directory, sourceSha, name, version }) {
  const receipt = JSON.parse(
    fs.readFileSync(path.join(directory, 'receipt.json'), 'utf8')
  );
  const pkg = receipt.package;
  const archives = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith('.tgz'));
  if (
    !/^[a-f0-9]{40}$/.test(sourceSha || '') ||
    receipt.version !== 2 ||
    receipt.phase !== 'public' ||
    receipt.sourceSha !== sourceSha ||
    receipt.qualified !== true ||
    receipt.blocker ||
    receipt.processGroupsDrained !== true ||
    receipt.temporaryFixtureDrained !== true ||
    receipt.lifecycleScriptsExecuted !== false ||
    receipt.modelActivity !== false ||
    pkg?.name !== name ||
    pkg?.version !== version ||
    archives.length !== 1 ||
    pkg.archive !== archives[0] ||
    path.basename(pkg.archive) !== pkg.archive
  ) {
    throw new Error('PUBLIC_QUALIFICATION_RECEIPT_MISMATCH');
  }
  const archive = path.join(directory, pkg.archive);
  const stat = fs.lstatSync(archive);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    createHash('sha256').update(fs.readFileSync(archive)).digest('hex') !==
      pkg.sha256
  ) {
    throw new Error('PUBLIC_QUALIFICATION_ARTIFACT_MISMATCH');
  }
  return archive;
}

if (require.main === module) {
  const [directory, sourceSha, name, version] = process.argv.slice(2);
  console.log(verifyPublishReceipt({ directory, sourceSha, name, version }));
}
module.exports = {
  registryRewrites,
  requireInstalledDependencies,
  workflowPhase,
  verifyPublishReceipt,
};
