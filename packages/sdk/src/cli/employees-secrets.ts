import { spawn } from 'node:child_process';
import { lstat, open, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { employeeEmailSchema } from '../platform-employees';
import {
  defaultSecurityRunner,
  ensurePrivateDirectory,
  keychainAvailable,
  type PasswordStore,
  readPrivateJsonFile,
  type SecurityRunner,
  writePrivateFile,
} from './qa-users-secrets';

// A staff employee's initial password lives only in the macOS Keychain
// (service tuturuuu-employee, account = address) or in an owner-only file
// under ~/.tuturuuu/employees. Nothing here writes it to stdout, stderr,
// argv or an error message, and nothing here overwrites a stored password.

export const EMPLOYEE_KEYCHAIN_SERVICE = 'tuturuuu-employee';
const KEYCHAIN_DUPLICATE_ITEM = 45;
/** Starts with a letter (never parsed as an option); no quotes, spaces or backslashes. */
export const EMPLOYEE_PASSWORD = /^[A-Za-z][A-Za-z0-9!%+,.:=?@^_~-]{11,71}$/u;

export function employeesHome() {
  return resolve(
    process.env.TUTURUUU_EMPLOYEES_HOME ||
      join(homedir(), '.tuturuuu', 'employees')
  );
}

const stateSchema = z.strictObject({
  version: z.literal(1),
  email: employeeEmailSchema,
  displayName: z.string().min(1).max(100),
  operationId: z.uuid(),
  status: z.enum(['pending', 'created']),
  userId: z.uuid().nullable(),
  store: z.enum(['keychain', 'file']),
  location: z.string().max(1024),
  updatedAt: z.string(),
});
export type EmployeeState = z.infer<typeof stateSchema>;
const fileCredentialSchema = z.strictObject({
  email: employeeEmailSchema,
  password: z.string().regex(EMPLOYEE_PASSWORD),
});

/** Reads `security` stdout into memory only (never echoed). */
export type KeychainReader = (
  args: string[]
) => Promise<{ code: number; stdout: string }>;

export const defaultKeychainReader: KeychainReader = (args) =>
  new Promise((resolvePromise) => {
    const child = spawn('/usr/bin/security', args, {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let stdout = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      if (stdout.length < 4096) stdout += chunk;
    });
    child.on('error', () => resolvePromise({ code: 1, stdout: '' }));
    child.on('close', (code) => resolvePromise({ code: code ?? 1, stdout }));
  });

export interface EmployeeSecretStore {
  readState(email: string): Promise<EmployeeState | undefined>;
  writeState(state: EmployeeState): Promise<string>;
  /** Creates the state file exclusively; refuses when one already exists. */
  claimState(state: EmployeeState): Promise<void>;
  removeState(email: string): Promise<void>;
  /** Whether any stored password exists for the address, in either store. */
  hasPassword(email: string): Promise<boolean>;
  /** Stores a new password; refuses to replace an existing one. */
  storePassword(
    email: string,
    password: string,
    store: PasswordStore
  ): Promise<{ store: PasswordStore; location: string }>;
  readPassword(
    email: string,
    store: PasswordStore
  ): Promise<string | undefined>;
  removePassword(email: string, store: PasswordStore): Promise<void>;
  statePath(email: string): string;
  credentialPath(email: string): string;
}

function address(email: string) {
  const parsed = employeeEmailSchema.safeParse(email);
  if (!parsed.success) throw new Error('Invalid employee address.');
  return parsed.data;
}

export function createEmployeeSecretStore({
  runner = defaultSecurityRunner,
  reader = defaultKeychainReader,
  keychain = keychainAvailable(),
}: {
  runner?: SecurityRunner;
  reader?: KeychainReader;
  keychain?: boolean;
} = {}): EmployeeSecretStore {
  const statePath = (email: string) =>
    join(employeesHome(), `${address(email)}.json`);
  const credentialPath = (email: string) =>
    join(employeesHome(), `${address(email)}.credential.json`);
  const home = async () => {
    await ensurePrivateDirectory(employeesHome());
  };
  /** Read-only: false when absent; refuses a symlinked or non-directory home. */
  const homeExists = async () => {
    const info = await lstat(employeesHome()).catch(() => undefined);
    if (!info) return false;
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new Error(
        'Employee credential directory must be a real directory.'
      );
    return true;
  };
  const keychainLocation = `macOS Keychain (service ${EMPLOYEE_KEYCHAIN_SERVICE}, account = address)`;

  async function keychainHas(email: string) {
    if (!keychain) return false;
    const { code } = await runner([
      'find-generic-password',
      '-s',
      EMPLOYEE_KEYCHAIN_SERVICE,
      '-a',
      address(email),
    ]);
    return code === 0;
  }

  async function fileHas(email: string) {
    if (!(await homeExists())) return false;
    return Boolean(await lstat(credentialPath(email)).catch(() => undefined));
  }

  async function hasPassword(email: string) {
    return (await keychainHas(email)) || (await fileHas(email));
  }

  async function storeInFile(email: string, password: string) {
    if (await fileHas(email))
      throw new Error(
        'A stored employee credential file already exists; not overwriting it.'
      );
    return writePrivateFile(
      credentialPath(email),
      `${JSON.stringify({ email: address(email), password }, null, 2)}\n`
    );
  }

  return {
    statePath,
    credentialPath,

    async readState(email) {
      if (!(await homeExists())) return undefined;
      const value = await readPrivateJsonFile(statePath(email));
      if (value === undefined) return undefined;
      const parsed = stateSchema.safeParse(value);
      if (!parsed.success || parsed.data.email !== address(email))
        throw new Error(
          `Employee state file ${statePath(email)} is unreadable; inspect it before retrying.`
        );
      return parsed.data;
    },

    async claimState(state) {
      await home();
      const parsed = stateSchema.parse(state);
      let handle: Awaited<ReturnType<typeof open>>;
      try {
        // 'wx' is O_CREAT | O_EXCL: never follows or replaces an existing path.
        handle = await open(statePath(parsed.email), 'wx', 0o600);
      } catch {
        throw new Error(
          `A local operation for ${parsed.email} already exists or is in progress; rerun to resume it.`
        );
      }
      try {
        await handle.writeFile(`${JSON.stringify(parsed, null, 2)}\n`);
      } finally {
        await handle.close();
      }
    },

    async writeState(state) {
      await home();
      const parsed = stateSchema.parse(state);
      return writePrivateFile(
        statePath(parsed.email),
        `${JSON.stringify(parsed, null, 2)}\n`
      );
    },

    async removeState(email) {
      await home();
      await rm(statePath(email), { force: true });
    },

    hasPassword,

    async storePassword(email, password, store) {
      const target = address(email);
      await home();
      if (!EMPLOYEE_PASSWORD.test(password))
        throw new Error('Refusing to store an unexpected employee credential.');
      if (await hasPassword(target))
        throw new Error(
          `A stored credential for ${target} already exists; not overwriting it.`
        );
      if (store === 'keychain' && keychain) {
        // No -U: an existing item makes this fail instead of being replaced.
        const command = `add-generic-password -s ${EMPLOYEE_KEYCHAIN_SERVICE} -a ${target} -l "Tuturuuu employee ${target}" -w ${password}\n`;
        const { code } = await runner(['-i'], command);
        if (code === 0) return { store, location: keychainLocation };
        // errSecDuplicateItem: an item appeared after the check; never replace it.
        if (code === KEYCHAIN_DUPLICATE_ITEM)
          throw new Error(
            `A stored credential for ${target} already exists; not overwriting it.`
          );
        // Never lose a credential that exists only in memory.
      }
      return { store: 'file', location: await storeInFile(target, password) };
    },

    async readPassword(email, store) {
      const target = address(email);
      if (store === 'keychain') {
        if (!keychain) return undefined;
        const { code, stdout } = await reader([
          'find-generic-password',
          '-s',
          EMPLOYEE_KEYCHAIN_SERVICE,
          '-a',
          target,
          '-w',
        ]);
        const password = stdout.replace(/\n$/u, '');
        return code === 0 && EMPLOYEE_PASSWORD.test(password)
          ? password
          : undefined;
      }
      if (!(await homeExists())) return undefined;
      const value = await readPrivateJsonFile(credentialPath(target));
      const parsed = fileCredentialSchema.safeParse(value);
      return parsed.success && parsed.data.email === target
        ? parsed.data.password
        : undefined;
    },

    async removePassword(email, store) {
      const target = address(email);
      if (store === 'keychain') {
        if (keychain)
          await runner([
            'delete-generic-password',
            '-s',
            EMPLOYEE_KEYCHAIN_SERVICE,
            '-a',
            target,
          ]);
        return;
      }
      await home();
      const info = await lstat(credentialPath(target)).catch(() => undefined);
      if (info?.isFile() && !info.isSymbolicLink())
        await rm(credentialPath(target), { force: true });
    },
  };
}
