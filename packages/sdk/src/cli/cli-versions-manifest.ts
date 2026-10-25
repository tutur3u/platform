import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { cp, lstat, open, readdir, rename, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';

export async function requireDirectory(path: string) {
  const stat = await lstat(path);
  if (!stat.isDirectory())
    throw new Error('Unsupported link or special directory in CLI release.');
}

export async function filesManifest(
  dir: string,
  { allowHardlinks = false } = {}
) {
  await requireDirectory(dir);
  const lines: string[] = [];
  const walk = async (path: string) => {
    for (const name of (await readdir(path)).sort()) {
      const full = join(path, name);
      const stat = await lstat(full);
      if (stat.isDirectory()) await walk(full);
      else if (!stat.isFile() || (!allowHardlinks && stat.nlink !== 1))
        throw new Error('Unsupported link or special file in CLI release.');
      else {
        const file = await open(
          full,
          constants.O_RDONLY | constants.O_NOFOLLOW
        );
        try {
          const opened = await file.stat();
          if (
            !opened.isFile() ||
            opened.ino !== stat.ino ||
            opened.dev !== stat.dev ||
            (!allowHardlinks && opened.nlink !== 1)
          )
            throw new Error('CLI release file changed during verification.');
          const hash = createHash('sha256')
            .update(await file.readFile())
            .digest('hex');
          lines.push(JSON.stringify([relative(dir, full), hash]));
        } finally {
          await file.close();
        }
      }
    }
  };
  await walk(dir);
  return {
    files: lines.length,
    sha256: createHash('sha256').update(lines.join('\n')).digest('hex'),
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
