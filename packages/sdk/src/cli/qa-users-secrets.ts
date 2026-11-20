import { spawn } from 'node:child_process';
import { constants, existsSync } from 'node:fs';
import { lstat, mkdir, open, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { writeFileAtomically } from './atomic-file';

// Credentials for QA test accounts live only in the macOS Keychain or in
// owner-only files under ~/.tuturuuu/qa. Nothing here writes them to stdout,
// stderr, argv or error messages.

export const QA_KEYCHAIN_SERVICE = 'tuturuuu-qa';
const RUN_ID = /^[a-z0-9]{8}$/u;
const USER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const QA_EMAIL = /^qa\+[a-z0-9]{8}-[0-9]{1,3}@(?:tuturuuu|tutur3u)\.com$/u;
const PASSWORD = /^[A-Za-z0-9_-]{20,128}$/u;

export type PasswordStore = 'keychain' | 'file';
export interface QaCredential {
  userId: string;
  email: string;
  password: string;
}

/** Runs `security`; stdin carries any secret. Output is never captured. */
export type SecurityRunner = (
  args: string[],
  stdin?: string
) => Promise<{ code: number }>;

export const defaultSecurityRunner: SecurityRunner = (args, stdin) =>
  new Promise((resolvePromise) => {
    const child = spawn('/usr/bin/security', args, {
      stdio: [stdin === undefined ? 'ignore' : 'pipe', 'ignore', 'ignore'],
    });
    child.on('error', () => resolvePromise({ code: 1 }));
    child.on('close', (code) => resolvePromise({ code: code ?? 1 }));
    if (stdin !== undefined) child.stdin?.end(stdin);
  });

export function keychainAvailable() {
  return process.platform === 'darwin' && existsSync('/usr/bin/security');
}

export function qaHome() {
  return resolve(
    process.env.TUTURUUU_QA_HOME || join(homedir(), '.tuturuuu', 'qa')
  );
}

function assertRunId(runId: string) {
  if (!RUN_ID.test(runId)) throw new Error('Invalid QA run ID.');
}
function assertUserId(userId: string) {
  if (!USER_ID.test(userId)) throw new Error('Invalid QA user ID.');
}

/** Creates (or verifies) an owner-only real directory, never a symlink. */
export async function ensurePrivateDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  // Checked and tightened through one descriptor, so a path swapped for a
  // symlink after mkdir is refused rather than followed.
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(
      path,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );
  } catch {
    throw new Error('QA credential directory must be a real directory.');
  }
  try {
    const info = await handle.stat();
    if (!info.isDirectory())
      throw new Error('QA credential directory must be a real directory.');
    if (typeof process.getuid === 'function' && info.uid !== process.getuid())
      throw new Error('QA credential directory must be owned by you.');
    if ((info.mode & 0o777) !== 0o700) await handle.chmod(0o700);
  } finally {
    await handle.close();
  }
}

export async function runDirectory(runId: string) {
  assertRunId(runId);
  const home = qaHome();
  await ensurePrivateDirectory(home);
  const directory = join(home, runId);
  await ensurePrivateDirectory(directory);
  return directory;
}

/** Atomic 0600 write. Refuses a symlink or non-file at the destination. */
export async function writePrivateFile(path: string, contents: string) {
  const target = resolve(path);
  const existing = await lstat(target).catch(() => undefined);
  if (existing && (existing.isSymbolicLink() || !existing.isFile()))
    throw new Error('Refusing to write credentials through a non-file path.');
  const parent = await lstat(dirname(target)).catch(() => undefined);
  if (!parent?.isDirectory())
    throw new Error('Credential output directory does not exist.');
  // The temporary file is created (or fchmod-ed) 0600 before the rename.
  await writeFileAtomically(target, contents, { mode: 0o600 });
  return target;
}

export function sessionFileName(
  userId: string,
  format: 'storage-state' | 'tokens'
) {
  assertUserId(userId);
  return `${userId}.${format === 'tokens' ? 'tokens' : 'storage-state'}.json`;
}

const MAX_CREDENTIALS_BYTES = 1024 * 1024;

/**
 * Opens the credentials file once without following a symlink, checks the
 * type, owner and size on that descriptor, and parses only the bytes read
 * from it, so a path swapped after the check is never read. O_NONBLOCK makes
 * a FIFO fail the type check instead of blocking for a writer.
 */
async function readCredentials(path: string): Promise<QaCredential[]> {
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new Error('Refusing to read credentials through a non-file path.');
  }
  try {
    const info = await handle.stat();
    if (
      !info.isFile() ||
      (typeof process.getuid === 'function' && info.uid !== process.getuid()) ||
      info.size > MAX_CREDENTIALS_BYTES
    )
      throw new Error('Refusing to read credentials through a non-file path.');
    const buffer = Buffer.alloc(MAX_CREDENTIALS_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_CREDENTIALS_BYTES)
      throw new Error('QA credentials file is unreadable.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
    } catch {
      throw new Error('QA credentials file is unreadable.');
    }
    return Array.isArray(parsed) ? (parsed as QaCredential[]) : [];
  } finally {
    await handle.close();
  }
}

export interface QaSecretStore {
  storePasswords(
    runId: string,
    credentials: QaCredential[],
    store: PasswordStore
  ): Promise<{ store: PasswordStore; location: string }>;
  removeUser(runId: string, userId: string, email: string): Promise<void>;
}

export function createQaSecretStore(
  runner: SecurityRunner = defaultSecurityRunner
): QaSecretStore {
  async function storeInKeychain(runId: string, credential: QaCredential) {
    if (!QA_EMAIL.test(credential.email) || !PASSWORD.test(credential.password))
      throw new Error('Refusing to store an unexpected QA credential.');
    const command = `add-generic-password -U -s ${QA_KEYCHAIN_SERVICE} -a ${credential.email} -l "Tuturuuu QA ${runId}" -w ${credential.password}\n`;
    const { code } = await runner(['-i'], command);
    if (code !== 0) throw new Error('Keychain write failed.');
  }

  async function storeInFile(runId: string, credentials: QaCredential[]) {
    const path = join(await runDirectory(runId), 'credentials.json');
    const merged = new Map(
      (await readCredentials(path)).map((entry) => [entry.userId, entry])
    );
    for (const credential of credentials)
      merged.set(credential.userId, credential);
    await writePrivateFile(
      path,
      `${JSON.stringify([...merged.values()], null, 2)}\n`
    );
    return path;
  }

  return {
    async storePasswords(runId, credentials, store) {
      assertRunId(runId);
      if (store === 'keychain') {
        try {
          for (const credential of credentials)
            await storeInKeychain(runId, credential);
          return {
            store,
            location: `macOS Keychain (service ${QA_KEYCHAIN_SERVICE}, account = email)`,
          };
        } catch {
          // Never lose a credential that exists only in memory.
          const location = await storeInFile(runId, credentials);
          return { store: 'file', location };
        }
      }
      return { store: 'file', location: await storeInFile(runId, credentials) };
    },

    async removeUser(runId, userId, email) {
      assertRunId(runId);
      assertUserId(userId);
      const directory = join(qaHome(), runId);
      const info = await lstat(directory).catch(() => undefined);
      if (info?.isDirectory() && !info.isSymbolicLink()) {
        for (const format of ['storage-state', 'tokens'] as const)
          await rm(join(directory, sessionFileName(userId, format)), {
            force: true,
          });
        const path = join(directory, 'credentials.json');
        const remaining = (await readCredentials(path)).filter(
          (entry) => entry.userId !== userId
        );
        if (remaining.length > 0)
          await writePrivateFile(
            path,
            `${JSON.stringify(remaining, null, 2)}\n`
          );
        else await rm(path, { force: true });
      }
      if (keychainAvailable() && QA_EMAIL.test(email))
        await runner([
          'delete-generic-password',
          '-s',
          QA_KEYCHAIN_SERVICE,
          '-a',
          email,
        ]);
    },
  };
}
