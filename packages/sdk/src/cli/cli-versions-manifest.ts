import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { cp, open, readdir, rename, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';

export async function requireDirectory(path: string) {
  const directory = await openNoFollow(path, constants.O_DIRECTORY);
  try {
    if (!(await directory.stat()).isDirectory())
      throw new Error('Unsupported link or special directory in CLI release.');
  } finally {
    await directory.close();
  }
}

async function openNoFollow(path: string, flags = 0) {
  try {
    return await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK | flags
    );
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error.code === 'ELOOP' || error.code === 'ENOTDIR')
    )
      throw new Error('Unsupported link or special entry in CLI release.', {
        cause: error,
      });
    throw error;
  }
}

export async function readVerifiedFile(
  path: string,
  { allowHardlinks = false } = {}
) {
  const file = await openNoFollow(path);
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || (!allowHardlinks && before.nlink !== 1n))
      throw new Error('Unsupported link or special file in CLI release.');
    const bytes = await file.readFile();
    const after = await file.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.nlink !== after.nlink ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs
    )
      throw new Error('CLI release file changed during verification.');
    return bytes;
  } finally {
    await file.close();
  }
}

export async function filesManifest(
  dir: string,
  { allowHardlinks = false } = {}
) {
  const lines: string[] = [];
  let packageJson: Buffer | undefined;
  const walk = async (path: string) => {
    await requireDirectory(path);
    for (const entry of (await readdir(path, { withFileTypes: true })).sort(
      (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    )) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (!entry.isFile())
        throw new Error('Unsupported link or special file in CLI release.');
      else {
        const bytes = await readVerifiedFile(full, { allowHardlinks });
        const hash = createHash('sha256').update(bytes).digest('hex');
        lines.push(JSON.stringify([relative(dir, full), hash]));
        if (path === dir && entry.name === 'package.json') packageJson = bytes;
      }
    }
  };
  await walk(dir);
  return {
    files: lines.length,
    sha256: createHash('sha256').update(lines.join('\n')).digest('hex'),
    packageJson,
  };
}

/** Publish supplier files, including bundled modules that Bun may omit during installation. */
export async function materializePackage(
  staging: string,
  expected: Awaited<ReturnType<typeof filesManifest>>
) {
  const modules = join(staging, 'node_modules');
  await requireDirectory(modules);
  const pkg = join(modules, 'tuturuuu');
  const source = join(staging, 'verify', 'package');
  await requireDirectory(join(staging, 'verify'));
  const actual = await filesManifest(source, { allowHardlinks: true });
  if (actual.sha256 !== expected.sha256 || actual.files !== expected.files)
    throw new Error(
      'Installed files differ from the verified tarball; nothing was published.'
    );
  const snapshot = join(staging, 'package-snapshot');
  await cp(source, snapshot, {
    recursive: true,
    dereference: false,
    errorOnExist: true,
    force: false,
  });
  const copied = await filesManifest(snapshot);
  if (copied.sha256 !== expected.sha256 || copied.files !== expected.files)
    throw new Error(
      'Installed files changed while materializing the CLI release.'
    );
  await rm(pkg, { recursive: true, force: true });
  await rename(snapshot, pkg);
  return copied;
}
