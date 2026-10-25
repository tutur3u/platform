import { constants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readFile,
  statfs,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';

const identitySchema = z.object({ dev: z.string(), ino: z.string() });
const manifestSchema = z.object({
  protocol: z.literal('descriptor-lock-v1'),
  root: identitySchema,
  fence: identitySchema,
  sqliteFence: identitySchema,
  runs: identitySchema,
  requests: identitySchema,
  mutex: identitySchema,
});
type Manifest = z.infer<typeof manifestSchema>;
type Identity = z.infer<typeof identitySchema>;
type Info = Awaited<ReturnType<typeof privateInfo>>;
const identity = (info: { dev: bigint; ino: bigint }): Identity => ({
  dev: String(info.dev),
  ino: String(info.ino),
});
const same = (info: { dev: bigint; ino: bigint }, expected: Identity) =>
  String(info.dev) === expected.dev && String(info.ino) === expected.ino;
const exists = async (path: string) =>
  lstat(path).then(
    () => true,
    (error: unknown) => {
      if (isMissing(error)) return false;
      throw error;
    }
  );
const isMissing = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'ENOENT';
const invalid = () =>
  new Error(
    'Balancer ledger is legacy, incomplete or replaced. Refusing mutation; preserve it and use a fresh TTR_BALANCER_HOME after stopping old controllers.'
  );

// Unknown types (including NFS, SMB, FUSE and cluster filesystems) fail closed.
const localTypes: Readonly<Record<string, readonly number[]>> = {
  darwin: [26, 17], // APFS, HFS
  linux: [0xef53, 0x58465342, 0x9123683e, 0x01021994], // ext, XFS, Btrfs, tmpfs
};
async function requireLocal(path: string) {
  const { type } = await statfs(path);
  if (!localTypes[process.platform]?.includes(type))
    throw new Error(
      `Balancer ledger requires a supported local filesystem; refusing shared or unknown filesystem type 0x${type.toString(16)}.`
    );
}

async function privateInfo(path: string, directory: boolean) {
  const info = await lstat(path, { bigint: true });
  if (
    (directory ? !info.isDirectory() : !info.isFile()) ||
    (info.mode & 0o077n) !== 0n ||
    info.uid !== BigInt(process.geteuid?.() ?? -1)
  )
    throw invalid();
  return info;
}

async function initialize(root: string) {
  await mkdir(dirname(root), { recursive: true, mode: 0o700 });
  await requireLocal(dirname(root));
  try {
    await mkdir(root, { mode: 0o700 });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'EEXIST'
    )
      return;
    throw error;
  }
  const fence = join(root, '.lock');
  // This directory is a permanent cutover fence, with no PID to reclaim.
  // Never adopt a legacy root: its controller may already be inside an action.
  await mkdir(fence, { mode: 0o700 });
  // Retire the previous SQLite protocol with a directory at its DB pathname.
  // Old SQLite controllers cannot open it, including ones started later.
  const sqliteFence = join(root, 'mutation-lock.sqlite');
  await mkdir(sqliteFence, { mode: 0o700 });
  await writeFile(join(sqliteFence, 'retired'), 'descriptor-lock-v1', {
    flag: 'wx',
    mode: 0o400,
  });

  if (
    (await exists(join(root, 'runs'))) ||
    (await exists(join(root, 'requests')))
  )
    throw invalid();
  await mkdir(join(root, 'runs'), { mode: 0o700 });
  await mkdir(join(root, 'requests'), { mode: 0o700 });
  const mutexPath = join(fence, 'mutex');
  const file = await open(
    mutexPath,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_RDWR |
      constants.O_NOFOLLOW,
    0o600
  );
  try {
    await file.sync();
  } finally {
    await file.close();
  }
  const manifest: Manifest = {
    protocol: 'descriptor-lock-v1',
    root: identity(await privateInfo(root, true)),
    fence: identity(await privateInfo(fence, true)),
    sqliteFence: identity(await privateInfo(sqliteFence, true)),
    runs: identity(await privateInfo(join(root, 'runs'), true)),
    requests: identity(await privateInfo(join(root, 'requests'), true)),
    mutex: identity(await privateInfo(mutexPath, false)),
  };
  // Published last. Interrupted initialization is rejected, never repaired.
  await writeFile(join(fence, 'protocol.json'), JSON.stringify(manifest), {
    flag: 'wx',
    mode: 0o600,
  });
}

async function validate(root: string, manifest: Manifest) {
  await requireLocal(root);
  for (const [path, expected] of [
    [root, manifest.root],
    [join(root, '.lock'), manifest.fence],
    [join(root, 'mutation-lock.sqlite'), manifest.sqliteFence],
    [join(root, 'runs'), manifest.runs],
    [join(root, 'requests'), manifest.requests],
  ] as const) {
    const info = await privateInfo(path, true);
    if (!same(info, expected) || String(info.dev) !== manifest.root.dev)
      throw invalid();
  }
  if (await exists(join(root, '.lock', 'pid'))) throw invalid();
}

async function established(root: string): Promise<Manifest> {
  await initialize(root);
  try {
    const path = join(root, '.lock', 'protocol.json');
    await privateInfo(path, false);
    const manifest = manifestSchema.parse(
      JSON.parse(await readFile(path, 'utf8'))
    );
    await validate(root, manifest);
    return manifest;
  } catch (error) {
    if (
      isMissing(error) ||
      error instanceof z.ZodError ||
      error instanceof SyntaxError
    )
      throw invalid();
    throw error;
  }
}

function verifyMutex(info: Info, manifest: Manifest) {
  if (
    !info.isFile() ||
    !same(info, manifest.mutex) ||
    String(info.dev) !== manifest.root.dev ||
    (info.mode & 0o077n) !== 0n ||
    info.uid !== BigInt(process.geteuid?.() ?? -1)
  )
    throw invalid();
}

export async function withLedgerLock<T>(
  root: string,
  action: () => Promise<T>
): Promise<T> {
  if (process.versions.bun)
    throw new Error(
      'Balancer ledger mutations require Node.js. Use the installed ttr balancer command, which selects Node.js.'
    );
  const { tryLock } = await import('fs-native-extensions');
  const manifest = await established(root);
  const path = join(root, '.lock', 'mutex');
  // Ordinary acquisition never creates the file. A missing/replaced mutex is
  // an integrity failure even if another controller still holds the old fd.
  const file = await open(path, constants.O_RDWR | constants.O_NOFOLLOW).catch(
    (error: unknown) => {
      if (isMissing(error)) throw invalid();
      throw error;
    }
  );
  try {
    verifyMutex(await file.stat({ bigint: true }), manifest);
    for (let attempt = 0; !tryLock(file.fd); attempt++) {
      if (attempt >= 600) throw new Error('Balancer ledger lock is held.');
      await sleep(50);
    }
    await validate(root, manifest);
    verifyMutex(await file.stat({ bigint: true }), manifest);
    verifyMutex(await privateInfo(path, false), manifest);
    return await action();
  } finally {
    // BSD flock / Linux OFD locks belong to this fd, not the PID or pathname.
    await file.close();
  }
}
