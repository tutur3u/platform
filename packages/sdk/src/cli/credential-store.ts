import { spawn } from 'node:child_process';
import { lstat, mkdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import {
  CLI_EXIT,
  CREDENTIAL_FAMILIES,
  CliError,
  type CredentialFamily,
  type CredentialMetadata,
  type CredentialRecord,
  type CredentialStoreBackend,
} from './cli-contracts';
import { CLI_ENVS, type CliEnv } from './cli-env';
import { acquireUpgradeLock } from './devbox-upgrade-lock';
import {
  ensurePrivateDirectory,
  readPrivateJsonFile,
  writePrivateFile,
} from './qa-users-secrets';

export const ENV_VAR_BY_FAMILY: Record<CredentialFamily, string[]> = {
  'upskii-qa': ['TTR_UPSKII_QA_TOKEN', 'UPSKII_QA_PROVISIONER_TOKEN'],
  'upskii-user': ['TTR_UPSKII_SESSION_TOKEN', 'TTR_UPSKII_CLI_TOKEN'],
  'upskii-admin': ['TTR_UPSKII_ADMIN_TOKEN'],
  infra: ['TTR_INFRA_TOKEN', 'TTR_INFRA_CF_RO_TOKEN'],
  db: ['TTR_DB_RO_TOKEN'],
  tuturuuu: ['TTR_ACCESS_TOKEN'],
};

export function keychainServiceName(family: CredentialFamily, env: CliEnv) {
  return `com.tuturuuu.ttr.${family}.${env}`;
}

function policyError(code: string, message: string) {
  return new CliError({ code, message, exitCode: CLI_EXIT.policy });
}

const SAFE_NON_SECRET_FLAGS = new Set([
  'auth-mode',
  'credentials',
  'credentials-file',
  'password-store',
  'secret-out',
  'token-stdin',
]);

export function rejectSecretFlags(
  flags: Record<string, unknown>,
  forbidden: string[] = []
): void {
  const extraNames = new Set(
    forbidden.map((name) => name.replace(/^--/u, '').toLowerCase())
  );
  for (const flag of Object.keys(flags)) {
    const name = flag
      .replace(/^--/u, '')
      .replace(/([a-z0-9])([A-Z])/gu, '$1-$2')
      .toLowerCase();
    if (
      SAFE_NON_SECRET_FLAGS.has(name) &&
      !extraNames.has(name) &&
      !extraNames.has(flag.replace(/^--/u, '').toLowerCase())
    ) {
      continue;
    }
    if (
      extraNames.has(name) ||
      extraNames.has(flag.replace(/^--/u, '').toLowerCase()) ||
      /(?:^|[-_])(?:tokens?|pass(?:word|wd)?|pw|secret|cookie|api[-_]?key|auth(?:orization)?|bearer|credentials?|jwt)(?:$|[-_])/u.test(
        name
      )
    ) {
      throw policyError(
        'SECRET_IN_CLI_FLAG',
        'Pass credentials through the environment or the credential store.'
      );
    }
  }
}

type Secrets = readonly (string | undefined | null)[];

export function expandSecretVariants(secrets: Secrets): string[] {
  const expanded = new Set<string>();
  for (const raw of secrets) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    expanded.add(raw);
    expanded.add(trimmed);
    const bearerMatch = /^Bearer\s+(.+)$/iu.exec(trimmed);
    if (bearerMatch?.[1]?.trim()) {
      expanded.add(bearerMatch[1].trim());
    }
    if (trimmed.includes('=')) {
      for (const part of trimmed.split(';')) {
        const eqIndex = part.indexOf('=');
        if (eqIndex > 0) {
          const val = part.slice(eqIndex + 1).trim();
          if (val) expanded.add(val);
        }
      }
    }
  }
  return [...expanded];
}

function encodedSecretForms(secret: string): string[] {
  const forms = new Set<string>([
    secret,
    JSON.stringify(secret).slice(1, -1),
    encodeURIComponent(secret),
  ]);
  if (secret.length >= 6) {
    forms.add(Buffer.from(secret, 'utf8').toString('base64'));
    forms.add(Buffer.from(secret, 'utf8').toString('base64url'));
  }
  return [...forms].filter((value) => value.length >= 6);
}

export function assertNoCredentialLeak(serialized: string, secrets: Secrets) {
  const candidates = expandSecretVariants(secrets);
  const containsSecret = candidates.some((secret) => {
    if (!secret || secret.length < 6) return false;
    return encodedSecretForms(secret).some((form) => serialized.includes(form));
  });
  if (containsSecret) {
    throw policyError('CREDENTIAL_LEAK_BLOCKED', 'Credential output blocked.');
  }
}

export function redactSecrets(text: string, secrets: Secrets): string {
  const forms = new Set<string>();
  for (const secret of expandSecretVariants(secrets)) {
    if (!secret) continue;
    for (const form of encodedSecretForms(secret)) forms.add(form);
    if (secret.length < 6) forms.add(secret);
  }
  const patterns = Array.from(forms)
    .sort((left, right) => right.length - left.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
  return patterns.length
    ? text.replace(new RegExp(patterns.join('|'), 'gu'), '[REDACTED]')
    : text;
}

type Exec = (
  cmd: string,
  args: string[],
  input?: string
) => Promise<{ ok: boolean; stdout: string; stderr: string }>;

const run: Exec = (cmd, args, input) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      timeout: 5_000,
      killSignal: 'SIGKILL',
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout = (stdout + chunk).slice(-1_048_576);
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-4_096);
    });
    child.stdin.on('error', () => undefined);
    child.on('error', () =>
      resolve({ ok: false, stdout: '', stderr: 'Unavailable' })
    );
    child.on('close', (code) =>
      resolve({
        ok: code === 0,
        stdout,
        stderr: code === null ? 'Unavailable' : stderr,
      })
    );
    child.stdin.end(input, 'utf8');
  });

const profileSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/u)
  .refine((name) => !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/u.test(name));

const keySchema = z.object({
  family: z.enum(CREDENTIAL_FAMILIES),
  env: z.enum(CLI_ENVS),
  profile: profileSchema.default('default'),
});
const metadataSchema = keySchema.extend({
  backend: z.enum(['keychain', 'secret-tool', 'dpapi', 'file']),
  expiresAt: z.iso.datetime({ offset: true }).nullish(),
  origin: z.string().optional(),
  scopes: z.array(z.string()),
  updatedAt: z.iso.datetime(),
});

type Key = z.output<typeof keySchema>;
type Backend = Exclude<CredentialStoreBackend, 'env'>;
type SetInput = Pick<CredentialMetadata, 'scopes' | 'expiresAt' | 'origin'> &
  z.input<typeof keySchema> & {
    secret: string;
    backend?: CredentialStoreBackend;
  };

function parseKey(input: z.input<typeof keySchema>): Key {
  const result = keySchema.safeParse(input);
  if (!result.success)
    throw policyError(
      'INVALID_CREDENTIAL_PROFILE',
      'Invalid credential family, environment, or profile.'
    );
  return result.data;
}

const matches = (left: Key, right: Key) =>
  left.family === right.family &&
  left.env === right.env &&
  left.profile === right.profile;

const security = '/usr/bin/security';
const powershell = 'powershell.exe';
const dpapiScript = (method: 'Protect' | 'Unprotect') => [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.Security; " +
    '$bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd()); ' +
    `$result = [Security.Cryptography.ProtectedData]::${method}(` +
    '$bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser); ' +
    '[Console]::Out.Write([Convert]::ToBase64String($result))',
];

function backendError() {
  return new CliError({
    code: 'CREDENTIAL_STORE_UNAVAILABLE',
    exitCode: CLI_EXIT.unavailable,
    message: 'The credential store operation failed.',
  });
}

function missingPath(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function createCredentialStore(
  options: {
    homeDir?: string;
    platform?: NodeJS.Platform;
    env?: Record<string, string | undefined>;
    exec?: Exec;
  } = {}
) {
  const root = join(options.homeDir ?? homedir(), '.tuturuuu');
  const indexPath = join(root, 'profiles.json');
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const exec = options.exec ?? run;
  const envSecrets = () =>
    Object.values(ENV_VAR_BY_FAMILY)
      .flat()
      .map((name) => env[name]);
  const invoke: Exec = async (cmd, args, input) => {
    try {
      return await exec(cmd, args, input);
    } catch {
      throw backendError();
    }
  };

  async function preferredBackend(): Promise<Backend> {
    if (platform === 'darwin') {
      const result = await invoke(security, ['list-keychains', '-d', 'user']);
      if (result.ok) return 'keychain';
    }
    if (platform === 'linux') {
      const result = await invoke('secret-tool', [
        'lookup',
        'service',
        'com.tuturuuu.ttr.backend-probe',
      ]);
      if (result.ok || !result.stderr.trim()) return 'secret-tool';
    }
    if (platform === 'win32') return 'dpapi';
    return 'file';
  }

  const credentialRoot = join(root, 'credentials');
  const credentialDirectory = (key: Key) =>
    join(credentialRoot, key.env, key.family);
  const credentialDirs = (key: Key) => [
    root,
    credentialRoot,
    join(credentialRoot, key.env),
    credentialDirectory(key),
  ];
  const credentialPath = (key: Key) =>
    join(credentialDirectory(key), `${key.profile}.json`);

  async function realDirectories(paths: string[]) {
    for (const path of paths) {
      try {
        const info = await lstat(path);
        if (
          !info.isDirectory() ||
          (typeof process.getuid === 'function' &&
            info.uid !== process.getuid())
        )
          throw backendError();
      } catch (error) {
        if (missingPath(error)) return false;
        throw error;
      }
    }
    return true;
  }

  async function ensureStoreDirectory(path: string) {
    if (platform !== 'win32') return ensurePrivateDirectory(path);
    await mkdir(path, { recursive: true, mode: 0o700 });
    await realDirectories([path]);
  }

  async function readIndex() {
    if (!(await realDirectories([root]))) return [];
    const content = await readPrivateJsonFile(indexPath);
    if (content === undefined) return [];
    const result = z.array(metadataSchema).safeParse(content);
    if (!result.success) throw backendError();
    return result.data;
  }

  async function withWriteLock<T>(action: () => Promise<T>): Promise<T> {
    await ensureStoreDirectory(root);
    const lock = await acquireUpgradeLock(join(root, 'credentials.lock'));
    if (!lock)
      throw new CliError({
        code: 'CREDENTIAL_STORE_BUSY',
        exitCode: CLI_EXIT.conflict,
        message: 'Another credential change is in progress. Retry shortly.',
      });
    try {
      return await action();
    } finally {
      await lock();
    }
  }

  function targetArgs(key: Key, backend: 'keychain' | 'secret-tool') {
    const service = keychainServiceName(key.family, key.env);
    return backend === 'keychain'
      ? ['-s', service, '-a', key.profile]
      : ['service', service, 'profile', key.profile];
  }

  async function readSecret(
    key: Key,
    backend: Backend
  ): Promise<string | null> {
    if (backend === 'file' || backend === 'dpapi') {
      if (!(await realDirectories(credentialDirs(key)))) return null;
      const content = await readPrivateJsonFile(credentialPath(key));
      if (content === undefined) return null;
      if (backend === 'file') {
        const result = z
          .object({ secret: z.string().min(1) })
          .safeParse(content);
        if (!result.success) throw backendError();
        return result.data.secret;
      }
      const result = z
        .object({ protectedValue: z.base64().min(1) })
        .safeParse(content);
      if (!result.success) throw backendError();
      const decoded = await invoke(
        powershell,
        dpapiScript('Unprotect'),
        result.data.protectedValue
      );
      if (!decoded.ok || !decoded.stdout.trim()) throw backendError();
      return Buffer.from(decoded.stdout.trim(), 'base64').toString('utf8');
    }

    const args = targetArgs(key, backend);
    const result =
      backend === 'keychain'
        ? await invoke(security, ['find-generic-password', '-w', ...args])
        : await invoke('secret-tool', ['lookup', ...args]);
    if (!result.ok) {
      if (
        backend === 'keychain'
          ? result.stderr.includes(
              'The specified item could not be found in the keychain'
            )
          : !result.stderr.trim()
      )
        return null;
      throw backendError();
    }
    return result.stdout.replace(/\r?\n$/u, '') || null;
  }

  async function writeSecret(key: Key, backend: Backend, secret: string) {
    if (backend === 'file' || backend === 'dpapi') {
      for (const dir of credentialDirs(key)) await ensureStoreDirectory(dir);
      let content: { secret: string } | { protectedValue: string } = { secret };
      if (backend === 'dpapi') {
        const result = await invoke(
          powershell,
          dpapiScript('Protect'),
          Buffer.from(secret, 'utf8').toString('base64')
        );
        if (!result.ok || !result.stdout.trim()) throw backendError();
        content = { protectedValue: result.stdout.trim() };
      }
      await writePrivateFile(
        credentialPath(key),
        `${JSON.stringify(content)}\n`
      );
      return;
    }

    const args = targetArgs(key, backend);
    if (backend === 'keychain') {
      // The interactive command receives hexadecimal password data on stdin.
      const hex = Buffer.from(secret, 'utf8').toString('hex');
      const result = await invoke(
        security,
        ['-i'],
        `add-generic-password -U ${args.join(' ')} -X ${hex}\n`
      );
      if (!result.ok || (await readSecret(key, backend)) !== secret)
        throw backendError();
      return;
    }
    const result = await invoke(
      'secret-tool',
      ['store', '--label=Tuturuuu CLI credential', ...args],
      secret
    );
    if (!result.ok) throw backendError();
  }

  async function removeSecret(key: Key, backend: Backend) {
    if (backend === 'file' || backend === 'dpapi') {
      if (await realDirectories(credentialDirs(key)))
        await rm(credentialPath(key), { force: true });
      return;
    }
    const args = targetArgs(key, backend);
    const result =
      backend === 'keychain'
        ? await invoke(security, ['delete-generic-password', ...args])
        : await invoke('secret-tool', ['clear', ...args]);
    if (!result.ok && (await readSecret(key, backend)) !== null)
      throw backendError();
  }

  return {
    preferredBackend,
    async set(input: SetInput): Promise<CredentialMetadata> {
      const key = parseKey(input);
      if (
        typeof input.secret !== 'string' ||
        !input.secret.trim() ||
        /[\x00-\x1f\x7f]/u.test(input.secret)
      )
        throw policyError(
          'INVALID_CREDENTIAL',
          'A non-empty, single-line credential is required.'
        );

      return withWriteLock(async () => {
        const current = await readIndex();
        const previous = current.find((entry) => matches(entry, key));
        const detected = await preferredBackend();
        const backend = input.backend ?? detected;
        if (backend === 'file' && input.backend !== 'file') {
          throw new CliError({
            code: 'CREDENTIAL_STORE_UNAVAILABLE',
            exitCode: CLI_EXIT.policy,
            hint: 'Pass --store file explicitly to opt in to 0600 plaintext local file storage.',
            message:
              'OS keychain / secure credential store is unavailable; refusing silent plaintext file fallback.',
          });
        }
        const result = metadataSchema.safeParse({
          ...key,
          backend,
          expiresAt: input.expiresAt,
          origin: input.origin,
          scopes: input.scopes,
          updatedAt: new Date().toISOString(),
        });
        if (!result.success)
          throw policyError(
            'INVALID_CREDENTIAL_METADATA',
            'Invalid credential metadata or storage backend.'
          );
        const metadata = result.data;
        const next = current
          .filter((entry) => !matches(entry, key))
          .concat(metadata);
        const index = `${JSON.stringify(next, null, 2)}\n`;
        assertNoCredentialLeak(index, [input.secret, ...envSecrets()]);
        const fields = [
          key.profile,
          input.origin,
          input.expiresAt,
          ...input.scopes,
        ];
        if (fields.some((field) => field?.includes(input.secret)))
          throw policyError(
            'CREDENTIAL_LEAK_BLOCKED',
            'Credential output blocked.'
          );

        const priorBackend = previous?.backend;
        const fileBackend = (value: Backend | undefined) =>
          value === 'file' || value === 'dpapi';
        const sameSlot =
          priorBackend === metadata.backend ||
          (fileBackend(priorBackend) && fileBackend(metadata.backend));
        const oldSecret = previous
          ? await readSecret(key, previous.backend)
          : null;
        try {
          await writeSecret(key, metadata.backend, input.secret);
          if (priorBackend && !sameSlot) await removeSecret(key, priorBackend);
          await writePrivateFile(indexPath, index);
        } catch (error) {
          if (!sameSlot || oldSecret === null)
            await removeSecret(key, metadata.backend);
          if (priorBackend && oldSecret !== null)
            await writeSecret(key, priorBackend, oldSecret);
          throw error;
        }
        return metadata;
      });
    },

    async get(
      input: z.input<typeof keySchema>
    ): Promise<CredentialRecord | null> {
      const key = parseKey(input);
      const envSuffix = key.env.toUpperCase();
      // 1. Prefer strictly environment-scoped variables (e.g. TTR_UPSKII_QA_TOKEN_PROD).
      for (const baseName of ENV_VAR_BY_FAMILY[key.family]) {
        const scopedSecret = env[`${baseName}_${envSuffix}`];
        if (scopedSecret?.trim()) {
          return {
            ...key,
            backend: 'env',
            scopes: [],
            secret: scopedSecret,
            updatedAt: new Date().toISOString(),
          };
        }
      }
      // 2. Accept unscoped legacy env vars only when explicitly bound to key.env via
      //    <VAR>_ENV or TTR_CREDENTIAL_ENV, preventing prod/staging token cross-send.
      const globalBoundEnv = env.TTR_CREDENTIAL_ENV?.trim().toLowerCase();
      for (const name of ENV_VAR_BY_FAMILY[key.family]) {
        const secret = env[name];
        if (!secret?.trim()) continue;
        const varBoundEnv =
          env[`${name}_ENV`]?.trim().toLowerCase() ?? globalBoundEnv;
        if (varBoundEnv === key.env) {
          return {
            ...key,
            backend: 'env',
            scopes: [],
            secret,
            updatedAt: new Date().toISOString(),
          };
        }
      }
      const metadata = (await readIndex()).find((entry) => matches(entry, key));
      if (!metadata) return null;
      const secret = await readSecret(key, metadata.backend);
      return secret === null ? null : { ...metadata, secret };
    },

    async delete(input: z.input<typeof keySchema>): Promise<boolean> {
      const key = parseKey(input);
      if (!(await realDirectories([root]))) return false;
      return withWriteLock(async () => {
        const current = await readIndex();
        const metadata = current.find((entry) => matches(entry, key));
        if (!metadata) return false;
        await removeSecret(key, metadata.backend);
        const remaining = current.filter((entry) => !matches(entry, key));
        await writePrivateFile(
          indexPath,
          `${JSON.stringify(remaining, null, 2)}\n`
        );
        return true;
      });
    },

    async list(filter?: {
      family?: CredentialFamily;
      env?: CliEnv;
    }): Promise<CredentialMetadata[]> {
      return (await readIndex()).filter(
        (entry) =>
          (!filter?.family || entry.family === filter.family) &&
          (!filter?.env || entry.env === filter.env)
      );
    },
  };
}
