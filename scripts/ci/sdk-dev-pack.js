const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runProcess } = require('./sdk-package-process');
const { qualify } = require('./qualify-sdk-package');
const { verifyPublishReceipt } = require('./sdk-qualification-phase');

function devVersion(base, run, sha) {
  if (
    !/^\d+\.\d+\.\d+$/.test(base) ||
    !/^[1-9][0-9]*$/.test(run) ||
    !/^[a-f0-9]{40}$/.test(sha)
  )
    throw new Error('INVALID_DEV_IDENTITY');
  return `${base}-dev.${run}.${sha.slice(0, 7)}`;
}

function checksumManifest({ archive, version, sourceSha, internalOnly }) {
  const bytes = fs.readFileSync(archive);
  const digest = (algorithm, format) =>
    createHash(algorithm).update(bytes).digest(format);
  return {
    schemaVersion: 1,
    name: 'tuturuuu',
    version,
    channel: 'dev',
    sha: sourceSha,
    sourceSha,
    archive: path.basename(archive),
    internalOnly,
    integrity: `sha512-${digest('sha512', 'base64')}`,
    shasum: digest('sha1', 'hex'),
    sha256: digest('sha256', 'hex'),
  };
}

async function pack({
  root = process.cwd(),
  output,
  runId,
  internalOnly = true,
  run = runProcess,
  qualifyPackage = qualify,
} = {}) {
  root = fs.realpathSync(root);
  async function command(executable, args, timeoutMs = 30000) {
    const result = await run(executable, args, {
      cwd: root,
      env: process.env,
      timeoutMs,
    });
    if (result.status !== 0 || result.signal)
      throw new Error(`DEV_PACK_COMMAND_FAILED: ${executable}`);
    return result.stdout.trim();
  }
  if (
    await command('git', ['status', '--porcelain', '--untracked-files=normal'])
  )
    throw new Error('DEV_PACK_REQUIRES_CLEAN_CHECKOUT');
  const sourceSha = await command('git', ['rev-parse', 'HEAD']);
  const base = JSON.parse(
    fs.readFileSync(path.join(root, 'packages/sdk/package.json'))
  ).version;
  const version = devVersion(
    base,
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: standalone uncached pack input
    runId ?? process.env.GITHUB_RUN_NUMBER ?? String(Date.now()),
    sourceSha
  );
  output ??= path.join(os.tmpdir(), `tuturuuu-sdk-${version}`);
  const lockPath = path.join(root, 'packages/sdk/.dev-pack.lock');
  const lock = fs.openSync(lockPath, 'wx', 0o600);
  try {
    await command(
      'bun',
      [
        'turbo:local',
        'run',
        'build',
        '--concurrency=1',
        '--filter=tuturuuu...',
      ],
      900000
    );
    await command('git', ['diff', '--exit-code', 'HEAD', '--']);
    const { receipt } = await qualifyPackage({
      root,
      output,
      sourceSha,
      packageVersion: version,
      phase: 'public',
    });
    if (!receipt.qualified)
      throw new Error(
        `DEV_PACK_QUALIFICATION_FAILED: ${receipt.blocker || 'unknown'}`
      );
    const archive = verifyPublishReceipt({
      directory: output,
      sourceSha,
      name: 'tuturuuu',
      version,
    });
    const manifest = checksumManifest({
      archive,
      version,
      sourceSha,
      internalOnly,
    });
    fs.writeFileSync(
      path.join(output, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { mode: 0o600 }
    );
    return { output, manifest };
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
}

if (require.main === module) {
  pack({
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: standalone uncached pack input
    output: process.env.QUALIFICATION_OUTPUT,
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: standalone uncached pack input
    internalOnly: process.env.SDK_DEV_INTERNAL_ONLY !== 'false',
  })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
module.exports = { devVersion, checksumManifest, pack };
