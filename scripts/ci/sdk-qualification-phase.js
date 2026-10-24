const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { devVersion } = require('./sdk-dev-identity');

function stageSdkRuntime(root, stageSdk, inventory) {
  for (const folder of ['dist', 'bin']) {
    const source = path.join(root, 'packages/sdk', folder);
    for (const file of inventory(source)) {
      const target = path.join(stageSdk, folder, file.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(source, file.path), target);
    }
  }
}

function checkIdentity(expected, value, stage) {
  if (
    typeof expected.version !== 'string' ||
    !value ||
    value.name !== expected.name ||
    value.version !== expected.version
  )
    throw Object.assign(new Error(`${stage} name/version mismatch`), {
      code: 'PACKAGE_IDENTITY_MISMATCH',
    });
  return { name: value.name, version: value.version };
}
function stageBuildIdentity({
  before,
  manifestPath,
  sourceSha,
  packageVersion,
}) {
  const source = JSON.parse(before);
  const version = packageVersion ?? source.version;
  const devParts =
    typeof packageVersion === 'string' &&
    /-dev\.([1-9][0-9]*)\.[a-f0-9]{7}$/.exec(packageVersion);
  if (
    !/^[a-f0-9]{40}$/.test(sourceSha || '') ||
    !/^\d+\.\d+\.\d+$/.test(source.version) ||
    (packageVersion !== undefined &&
      (!devParts ||
        packageVersion !== devVersion(source.version, devParts[1], sourceSha)))
  )
    throw new Error('INVALID_BUILD_IDENTITY');
  const staged = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (staged.name !== 'tuturuuu' || staged.version !== source.version)
    throw new Error('PACKAGE_IDENTITY_MISMATCH');
  staged.version = version;
  staged.tuturuuuBuild = {
    channel: packageVersion ? 'dev' : 'latest',
    sourceSha,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(staged, null, 2)}\n`);
  return { source, staged };
}

function registryRewrites(rewrites) {
  return rewrites.filter(({ field }) =>
    ['dependencies', 'peerDependencies', 'optionalDependencies'].includes(field)
  );
}

function requireInstalledDependencies(manifest, consumer, lock) {
  consumer = fs.realpathSync(consumer);
  const resolver = createRequire(
    path.join(consumer, 'node_modules/tuturuuu/package.json')
  );
  const dependencies = new Map();
  for (const field of [
    'dependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    for (const name of Object.keys(manifest[field] || {})) {
      const missing = () => {
        throw new Error(`INSTALLED_DEPENDENCY_MISSING: ${name}`);
      };
      if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(name))
        missing();
      let installed;
      let key;
      for (const modules of resolver.resolve.paths(name) || []) {
        const relative = path.relative(consumer, path.join(modules, name));
        if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
          continue;
        let current = consumer;
        let present = true;
        const parts = [...relative.split(path.sep), 'package.json'];
        for (const [index, part] of parts.entries()) {
          const isManifest = index === parts.length - 1;
          current = path.join(current, part);
          let stat;
          try {
            stat = fs.lstatSync(current);
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            present = false;
            // An existing package directory shadows any hoisted copy.
            if (isManifest) missing();
            break;
          }
          if (stat.isSymbolicLink()) missing();
          if (isManifest ? !stat.isFile() : !stat.isDirectory()) missing();
        }
        if (present) {
          installed = current;
          key = relative.split(path.sep).join('/');
          break;
        }
      }
      const entry = lock.packages?.[key];
      if (
        !installed ||
        !entry?.version ||
        entry.link ||
        !/^sha(?:512|1)-[A-Za-z0-9+/=]+$/.test(entry.integrity || '') ||
        !entry.resolved?.startsWith('https://registry.npmjs.org/')
      ) {
        missing();
      }
      const actual = JSON.parse(fs.readFileSync(installed, 'utf8'));
      if (actual.name !== name || actual.version !== entry.version)
        throw new Error(`INSTALLED_DEPENDENCY_MISMATCH: ${name}`);
      dependencies.set(name, entry);
    }
  }
  return dependencies;
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
    typeof pkg.archive !== 'string' ||
    pkg.archive.length > 255 ||
    !/^[a-z0-9][a-z0-9_-]*(?:\.[0-9][a-z0-9_-]*)*(?:\.[a-f0-9]{7})?\.tgz$/.test(
      pkg.archive
    ) ||
    path.basename(pkg.archive) !== pkg.archive
  ) {
    throw new Error('PUBLIC_QUALIFICATION_RECEIPT_MISMATCH');
  }
  const archive = path.join(directory, pkg.archive);
  const fd = fs.openSync(
    archive,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  );
  try {
    if (
      !fs.fstatSync(fd).isFile() ||
      createHash('sha256').update(fs.readFileSync(fd)).digest('hex') !==
        pkg.sha256
    ) {
      throw new Error('PUBLIC_QUALIFICATION_ARTIFACT_MISMATCH');
    }
    return archive;
  } finally {
    fs.closeSync(fd);
  }
}

if (require.main === module) {
  const [directory, sourceSha, name, version] = process.argv.slice(2);
  console.log(verifyPublishReceipt({ directory, sourceSha, name, version }));
}
module.exports = {
  stageSdkRuntime,
  stageBuildIdentity,
  checkIdentity,
  registryRewrites,
  requireInstalledDependencies,
  workflowPhase,
  verifyPublishReceipt,
};
