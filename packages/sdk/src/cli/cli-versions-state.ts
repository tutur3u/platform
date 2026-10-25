import { randomUUID } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { readVerifiedFile } from './cli-versions-manifest';

const stateSchema = z.object({
  current: z.string().optional(),
  previous: z.string().optional(),
  activatedAt: z.string().datetime().optional(),
});
type CliState = z.infer<typeof stateSchema>;

export async function readCliState(
  store: string,
  versionPattern: RegExp
): Promise<CliState> {
  const path = join(store, 'state.json');
  let bytes: Buffer;
  try {
    bytes = await readVerifiedFile(path);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return {};
    throw new Error(`Cannot read CLI activation state at ${path}.`, {
      cause: error,
    });
  }
  try {
    const state = stateSchema.parse(JSON.parse(bytes.toString('utf8')));
    for (const version of [state.current, state.previous])
      if (version !== undefined && !versionPattern.test(version))
        throw new Error('Invalid state version.');
    return state;
  } catch (error) {
    throw new Error(
      `CLI activation state is invalid at ${path}; inspect or restore state.json before retrying.`,
      { cause: error }
    );
  }
}

export async function writeCliState(store: string, state: CliState) {
  const temporary = join(store, `.state-${randomUUID()}.tmp`);
  const file = await open(temporary, 'wx', 0o600);
  try {
    try {
      await file.writeFile(`${JSON.stringify(state, null, 2)}\n`);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, join(store, 'state.json'));
  } finally {
    await rm(temporary, { force: true });
  }
}
