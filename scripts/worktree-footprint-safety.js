const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function isCheckout(dir) {
  return (
    fs.lstatSync(path.join(dir, '.git'), { throwIfNoEntry: false }) !==
      undefined ||
    (fs.lstatSync(path.join(dir, 'HEAD'), { throwIfNoEntry: false }) !==
      undefined &&
      fs
        .lstatSync(path.join(dir, 'objects'), { throwIfNoEntry: false })
        ?.isDirectory())
  );
}

function walkArtifact(
  dir,
  { remove = false, maxDepth = 32, maxEntries = 10000 } = {}
) {
  let entries = 0;
  function visit(target, depth) {
    if (++entries > maxEntries || depth > maxDepth)
      throw new Error('scan limit');
    if (
      path.basename(target) === '.git' ||
      (depth > 0 && isCheckout(path.dirname(target)))
    )
      throw new Error('nested-checkout');
    const stat = fs.lstatSync(target);
    if (!stat.isDirectory()) {
      if (remove) fs.unlinkSync(target);
      return;
    }
    if (isCheckout(target)) throw new Error('nested-checkout');
    const handle = fs.opendirSync(target);
    try {
      let entry = handle.readSync();
      while (entry !== null) {
        visit(path.join(target, entry.name), depth + 1);
        entry = handle.readSync();
      }
    } finally {
      handle.closeSync();
    }
    // Never recursively remove a directory: a newly added checkout must survive.
    if (remove) {
      if (isCheckout(target)) throw new Error('nested-checkout');
      fs.rmdirSync(target);
    }
  }
  try {
    visit(dir, 0);
    return null;
  } catch (error) {
    return error.message === 'nested-checkout'
      ? error.message
      : 'artifact-scan-unknown';
  }
}

function artifactCheckoutSafety(dir, worktree) {
  try {
    for (
      let ancestor = path.dirname(dir);
      ancestor !== worktree;
      ancestor = path.dirname(ancestor)
    ) {
      if (isCheckout(ancestor)) return 'nested-checkout';
      if (ancestor === path.dirname(ancestor)) return 'artifact-scan-unknown';
    }
    return walkArtifact(dir);
  } catch {
    return 'artifact-scan-unknown';
  }
}

function artifactLiveness(dir, spawnFile = spawnSync) {
  try {
    const result = spawnFile('lsof', ['-nP', '-Fpf', '+D', dir], {
      encoding: 'utf8',
      timeout: 5000,
      killSignal: 'SIGKILL',
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.error || result.signal || result.stderr?.trim())
      return 'liveness-unknown';
    if ([0, 1].includes(result.status) && result.stdout?.trim())
      return 'in-use';
    if (result.status === 1 && result.stdout === '' && result.stderr === '')
      return null;
  } catch {
    // A missing tool or failed probe cannot establish disuse.
  }
  return 'liveness-unknown';
}

module.exports = { artifactCheckoutSafety, artifactLiveness, walkArtifact };
