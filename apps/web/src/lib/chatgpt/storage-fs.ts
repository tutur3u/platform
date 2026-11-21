import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  assertChatGPTUserId,
  type ChatGPTStorageAdapter,
  type ChatGPTStore,
  emptyChatGPTStore,
  storeSchema,
} from './storage-schema';

export function credentialDirectory() {
  return resolve(
    process.env.CHATGPT_SUBSCRIPTIONS_DIR ??
      join(homedir(), '.config', 'tuturuuu', 'chatgpt')
  );
}

export function credentialPath(userId: string) {
  assertChatGPTUserId(userId);
  return join(
    credentialDirectory(),
    `${createHash('sha256').update(userId).digest('hex')}.json`
  );
}

async function readStore(path: string): Promise<ChatGPTStore> {
  let file: Awaited<ReturnType<typeof open>>;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptyChatGPTStore();
    }
    throw error;
  }
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)
    ) {
      throw new Error(
        'ChatGPT credential file must have owner-only permissions'
      );
    }
    return storeSchema.parse(JSON.parse(await file.readFile('utf8')));
  } finally {
    await file.close();
  }
}

async function writeStore(path: string, store: ChatGPTStore) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  let failed = false;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(storeSchema.parse(store)));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    await rm(temporary, { force: true }).catch((error) => {
      if (!failed) throw error;
    });
  }
}

/**
 * Owner-only files under the home directory, for local and self-hosted Node
 * servers. Atomic rename permits coherent read-only snapshots without a lock;
 * a lock directory serializes rotating refresh tokens across server workers.
 */
export const fsChatGPTStorage: ChatGPTStorageAdapter = {
  read: (userId) => readStore(credentialPath(userId)),
  async withStore(userId, operation) {
    const path = credentialPath(userId);
    const directory = credentialDirectory();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const directoryStat = await lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink())
      throw new Error('ChatGPT storage must be a private directory');
    await chmod(directory, 0o700);
    const lock = `${path}.lock`;
    let acquired = false;
    for (let attempt = 0; attempt < 300; attempt++) {
      try {
        await mkdir(lock, { mode: 0o700 });
        acquired = true;
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      }
    }
    if (!acquired) throw new Error('ChatGPT connection is busy; retry shortly');
    try {
      const store = await readStore(path);
      await writeStore(path, store);
      const result = await operation(store);
      await writeStore(path, store);
      return result;
    } finally {
      await rm(lock, { recursive: true });
    }
  },
};
