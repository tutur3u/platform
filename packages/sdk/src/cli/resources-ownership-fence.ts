import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, mkdir, open, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { assertOwnershipLaunchers } from './resources-compatibility';

export const ownershipFence = 'ownership-v1';
const absent = (error: unknown, code: string) =>
  error instanceof Error && 'code' in error && error.code === code;

export async function validOwnershipFence(path: string) {
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(
      path,
      constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW
    );
    const info = await file.stat();
    if (
      !info.isFile() ||
      info.size !== 2 ||
      (await file.readFile('utf8')) !== '1\n'
    )
      throw new Error(
        'Malformed process-ownership compatibility fence; admission is closed.'
      );
    return true;
  } catch (error) {
    if (absent(error, 'ENOENT')) return false;
    throw error;
  } finally {
    await file?.close();
  }
}

// The caller holds admission. Link a fully written record, never an empty marker.
export async function publishOwnershipFence(home: string) {
  const slots = join(home, 'slots');
  const target = join(slots, ownershipFence);
  for (const name of await readdir(home))
    if (/^ownership-fence\..+\.tmp$/u.test(name))
      await rm(join(home, name), { force: true });
  if (await validOwnershipFence(target)) return;
  await assertOwnershipLaunchers(home);
  await mkdir(slots, { recursive: true, mode: 0o700 });
  const staged = join(home, `ownership-fence.${randomUUID()}.tmp`);
  try {
    const file = await open(staged, 'wx', 0o600);
    try {
      await file.writeFile('1\n');
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      await link(staged, target);
      process.stderr.write(
        '[ttr resources] Process identity fencing enabled. Older clients are closed; upgrade every global CLI and refresh shims before sharing this home.\n'
      );
    } catch (error) {
      if (!absent(error, 'EEXIST')) throw error;
      if (!(await validOwnershipFence(target)))
        throw new Error(
          'Process-ownership fence disappeared; admission is closed.'
        );
    }
  } finally {
    await rm(staged, { force: true });
  }
}
