import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';

export const registrationSchema = z.object({
  clientId: z.string().startsWith('oaiapp_'),
  subject: z.string().min(1),
  email: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  idToken: z.string().optional(),
  expiresAt: z.number().optional(),
  scopes: z.array(z.string()),
});
export type ChatGPTRegistration = z.infer<typeof registrationSchema>;
const storeSchema = z.object({
  hostId: z.string().startsWith('urn:uuid:'),
  registrations: z.array(registrationSchema),
});
export type ChatGPTStore = z.infer<typeof storeSchema>;

export function chatGPTEnabled() {
  return (
    process.env.TUTURUUU_DEPLOYMENT_MODE === 'self-hosted' &&
    process.env.OPENAI_CHATGPT_ENABLED === 'true'
  );
}

export function credentialDirectory() {
  return resolve(
    process.env.CHATGPT_SUBSCRIPTIONS_DIR ??
      join(homedir(), '.config', 'tuturuuu', 'chatgpt')
  );
}

export function credentialPath(userId: string) {
  if (!z.uuid().safeParse(userId).success)
    throw new Error('Invalid Tuturuuu user ID');
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
      return { hostId: `urn:uuid:${randomUUID()}`, registrations: [] };
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
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(storeSchema.parse(store)));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** A filesystem lock serializes rotating refresh tokens across server workers. */
export async function withChatGPTStore<T>(
  userId: string,
  operation: (store: ChatGPTStore) => Promise<T>
): Promise<T> {
  const directory = credentialDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink())
    throw new Error('ChatGPT storage must be a private directory');
  await chmod(directory, 0o700);
  const path = credentialPath(userId);
  const lock = `${path}.lock`;
  let acquired = false;
  for (let attempt = 0; attempt < 100; attempt++) {
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
    // Persist the host before authorization, even when the operation later fails.
    await writeStore(path, store);
    const result = await operation(store);
    await writeStore(path, store);
    return result;
  } finally {
    await rm(lock, { recursive: true });
  }
}
