const fs = require('node:fs');
const path = require('node:path');

const OPTION = 'TUTURUUU_CHECK_CHILD_TMPDIR';
const SENTINEL = 'TUTURUUU_CHECK_CHILD_TEMP_ACTIVE';

function assertCheckCliAllowed(env = process.env) {
  if (env[SENTINEL] === '1') {
    throw new Error(
      'Nested bun check cannot run inside a child temp environment; run it separately through the original shared queues.'
    );
  }
}

function resolveResourceRoot(directory, fsImpl) {
  let ancestor = path.resolve(directory);
  const suffix = [];
  while (true) {
    try {
      fsImpl.lstatSync(ancestor);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw error;
      suffix.unshift(path.basename(ancestor));
      ancestor = parent;
      continue;
    }
    // Existing dangling symlinks and inaccessible targets fail closed here.
    return path.join(fsImpl.realpathSync(ancestor), ...suffix);
  }
}

function createCheckChildEnvironment(details, options = {}) {
  const env = options.env ?? process.env;
  const child = {
    ...env,
    FORCE_COLOR: '1',
    CHECK_DETAILS: details ? '1' : '0',
  };
  const directory = env[OPTION];
  if (directory === undefined) return child;
  const fsImpl = options.fs ?? fs;
  const uid = options.uid ?? process.getuid?.();
  if (
    uid === undefined ||
    !directory ||
    directory.includes('\0') ||
    !path.isAbsolute(directory)
  ) {
    throw new Error(
      'Child temp directory must be an absolute existing owner-only directory.'
    );
  }
  const normalized = path.resolve(directory);
  const stat = fsImpl.lstatSync(normalized);
  if (
    normalized === path.parse(normalized).root ||
    stat.isSymbolicLink() ||
    !stat.isDirectory() ||
    fsImpl.realpathSync(normalized) !== normalized ||
    stat.uid !== uid ||
    (stat.mode & 0o777) !== 0o700
  ) {
    throw new Error(
      'Child temp directory must be real, current-user owned, and mode 0700.'
    );
  }
  const resourceRoot = resolveResourceRoot(
    env.TTR_RESOURCES_HOME ??
      path.join(env.HOME ?? '', '.tuturuuu', 'resources'),
    fsImpl
  );
  if (
    normalized.split(path.sep).includes('tuturuuu-bun-check') ||
    normalized === resourceRoot ||
    normalized.startsWith(
      resourceRoot.endsWith(path.sep) ? resourceRoot : resourceRoot + path.sep
    )
  ) {
    throw new Error(
      'Child temp directory must not be a shared queue directory.'
    );
  }
  delete child[OPTION];
  child.TMPDIR = normalized;
  child.TMP = normalized;
  child.TEMP = normalized;
  child[SENTINEL] = '1';
  return child;
}

module.exports = { assertCheckCliAllowed, createCheckChildEnvironment };
