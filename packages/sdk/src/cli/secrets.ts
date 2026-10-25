import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isValidName, type Outcome, SecretsClient } from './secrets-client';
import { defaultCredentialsFile, loadCredentials } from './secrets-credentials';
import {
  readSourceFile,
  SecretsFileError,
  wipe,
  writePrivateFile,
} from './secrets-files';
import { secretsHelp } from './secrets-help';
import { OperationJournal, SecretsJournalError } from './secrets-journal';
import { reconcileWrites } from './secrets-reconcile';

export const UNKNOWN_OUTCOME_EXIT_CODE = 3;

export interface SecretsDeps {
  fetch?: typeof fetch;
  now?: () => number;
  randomUUID?: () => string;
  timeoutMs?: number;
  /** Test seam: loopback endpoints are never reachable without injecting this. */
  allowedEndpoints?: readonly string[];
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  setExitCode?: (code: number) => void;
  defaultCredentialsFile?: string;
}

export class SecretsUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretsUsageError';
  }
}

interface CommandSpec {
  positionals: number;
  values: string[];
  switches: string[];
}

const COMMANDS: Record<string, CommandSpec> = {
  put: {
    positionals: 1,
    values: ['from-file', 'credentials-file'],
    switches: [],
  },
  get: {
    positionals: 1,
    values: ['to-file', 'credentials-file'],
    switches: ['force'],
  },
  list: { positionals: 0, values: ['credentials-file'], switches: [] },
  rotate: { positionals: 0, values: ['credentials-file'], switches: [] },
  reconcile: {
    positionals: 1,
    values: ['credentials-file'],
    switches: [],
  },
};
const SECRET_FLAGS = /^(value|secret|password|token|data|bytes|content|key)/i;

interface Parsed {
  command: string;
  positionals: string[];
  values: Record<string, string>;
  switches: Set<string>;
}

export function parseSecretsArgs(argv: string[]): Parsed {
  const command = argv[0] ?? '';
  const spec = COMMANDS[command];
  if (!spec)
    throw new SecretsUsageError(
      'Unknown secrets command; see ttr secrets --help'
    );
  const positionals: string[] = [];
  const values: Record<string, string> = {};
  const switches = new Set<string>();
  for (let index = 1; index < argv.length; index++) {
    const arg = argv[index] as string;
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const [flag = '', inline] = arg.slice(2).split(/=(.*)/su, 2);
    if (SECRET_FLAGS.test(flag))
      throw new SecretsUsageError(
        'Values and tokens are never accepted on the command line'
      );
    if (spec.switches.includes(flag) && inline === undefined) {
      switches.add(flag);
      continue;
    }
    if (!spec.values.includes(flag))
      throw new SecretsUsageError('Unknown option; see ttr secrets --help');
    const value = inline ?? argv[++index];
    if (!value || (inline === undefined && value.startsWith('--')))
      throw new SecretsUsageError('An option is missing its value');
    values[flag] = value;
  }
  if (positionals.length > spec.positionals)
    throw new SecretsUsageError('Unexpected argument; see ttr secrets --help');
  return { command, positionals, values, switches };
}

function requireName(parsed: Parsed) {
  const name = parsed.positionals[0];
  if (!name || !isValidName(name))
    throw new SecretsUsageError(
      'A secret name is required: 1-128 letters, digits, spaces or . _ : / @ + -'
    );
  return name;
}

function requirePath(parsed: Parsed, flag: string) {
  const path = parsed.values[flag];
  if (!path || path === '-')
    throw new SecretsUsageError(
      `--${flag} <path> is required; secret values are never read from or printed to the terminal`
    );
  return resolve(path);
}

export async function runSecretsCommand(
  argv: string[],
  deps: SecretsDeps = {}
) {
  if (
    argv.length === 0 ||
    argv.includes('--help') ||
    argv.includes('-h') ||
    argv[0] === 'help'
  ) {
    (deps.stdout ?? ((text) => process.stdout.write(text)))(secretsHelp());
    return;
  }
  const parsed = parseSecretsArgs(argv);
  const stdout = deps.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = deps.stderr ?? ((text: string) => process.stderr.write(text));
  const setExitCode =
    deps.setExitCode ??
    ((code: number) => {
      process.exitCode = code;
    });
  const now = deps.now ?? Date.now;
  const newId = deps.randomUUID ?? randomUUID;

  // Validate every argument and local file before any credential or network use.
  const name =
    parsed.command === 'put' || parsed.command === 'get'
      ? requireName(parsed)
      : undefined;
  const fromFile =
    parsed.command === 'put' ? requirePath(parsed, 'from-file') : undefined;
  const toFile =
    parsed.command === 'get' ? requirePath(parsed, 'to-file') : undefined;
  const force = parsed.switches.has('force');

  const credentialsPath = resolve(
    parsed.values['credentials-file'] ??
      deps.defaultCredentialsFile ??
      defaultCredentialsFile()
  );
  const credentials = await labelled('Credentials file', () =>
    loadCredentials(credentialsPath, {
      now,
      allowedEndpoints: deps.allowedEndpoints,
    })
  );
  const client = new SecretsClient({
    credentials,
    fetch: deps.fetch,
    now,
    timeoutMs: deps.timeoutMs,
  });
  const journal = new OperationJournal(
    OperationJournal.pathFor(credentialsPath)
  );
  const scope = {
    workspaceId: credentials.workspaceId,
    vaultId: credentials.vaultId,
  };

  switch (parsed.command) {
    case 'list': {
      const result = unwrapRead(await client.list());
      for (const item of result.items) stdout(`${item.id}\t${item.name}\n`);
      if (result.items.length === 0) stdout('No secrets.\n');
      return;
    }
    case 'get': {
      if (!force) await writeGuard(toFile as string);
      const result = unwrapRead(await client.get(name as string));
      try {
        await labelled('Output file', () =>
          writePrivateFile(toFile as string, result.bytes, { replace: force })
        );
        stdout(
          `Wrote ${result.bytes.length} bytes of "${name}" to the output file.\n`
        );
      } finally {
        wipe(result.bytes);
      }
      return;
    }
    case 'put': {
      const bytes = await labelled('Source file', () =>
        readSourceFile(fromFile as string)
      );
      try {
        const requestId = newId();
        const outcome = await mutate(
          journal,
          scope,
          { requestId, action: 'put', name },
          now,
          () => client.put(name as string, bytes, requestId)
        );
        if (outcome.kind === 'ok')
          stdout(
            `Stored "${name}" (item ${outcome.value.itemId}, revision ${outcome.value.revision}).\n`
          );
        else finishMutation(outcome, requestId, stderr, setExitCode);
      } finally {
        wipe(bytes);
      }
      return;
    }
    case 'rotate': {
      const requestId = newId();
      const outcome = await mutate(
        journal,
        scope,
        { requestId, action: 'rotate' },
        now,
        () => client.rotate(requestId)
      );
      if (outcome.kind === 'ok')
        stdout(`Rotated the vault key (revision ${outcome.value.revision}).\n`);
      else finishMutation(outcome, requestId, stderr, setExitCode);
      return;
    }
    default: {
      const report = await reconcileWrites(
        client,
        journal,
        scope,
        parsed.positionals[0]
      );
      for (const line of report.lines) stdout(`${line}\n`);
      if (report.unresolved > 0) setExitCode(UNKNOWN_OUTCOME_EXIT_CODE);
    }
  }
}

async function writeGuard(path: string) {
  const exists = await lstat(path).then(
    () => true,
    () => false
  );
  if (exists)
    throw new SecretsUsageError(
      'Output file already exists; pass --force to replace it'
    );
}

function unwrapRead<T>(outcome: Outcome<T>): T {
  if (outcome.kind === 'ok') return outcome.value;
  throw new Error(
    outcome.kind === 'rejected'
      ? `The server refused the request (${outcome.code}${outcome.retryAfterSeconds !== undefined ? `, retry after ${outcome.retryAfterSeconds}s` : ''})`
      : `The request could not be completed (${outcome.cause}); nothing was changed`
  );
}

/**
 * Journals before sending so a crash or lost response leaves a record, and
 * clears it only when the answer proves the outcome. Never retries.
 */
async function mutate<T>(
  journal: OperationJournal,
  scope: { workspaceId: string; vaultId: string },
  operation: { requestId: string; action: 'put' | 'rotate'; name?: string },
  now: () => number,
  send: () => Promise<Outcome<T>>
): Promise<Outcome<T>> {
  try {
    await journal.begin({
      ...operation,
      ...scope,
      startedAt: new Date(now()).toISOString(),
    });
  } catch (error) {
    if (error instanceof SecretsJournalError && error.reason === 'blocked')
      throw new Error(
        `${error.message}: ${error.unresolved.map((entry) => entry.requestId).join(', ')}`
      );
    throw error;
  }
  const outcome = await send();
  if (outcome.kind === 'unknown') {
    // A `pending` entry blocks exactly like `unknown`, so a failed save is safe.
    await journal.markUnknown(operation.requestId).catch(() => undefined);
  } else await journal.resolve(operation.requestId);
  return outcome;
}

function finishMutation(
  outcome: Exclude<Outcome<unknown>, { kind: 'ok' }>,
  requestId: string,
  stderr: (text: string) => void,
  setExitCode: (code: number) => void
) {
  if (outcome.kind === 'rejected') {
    throw new Error(
      `The server refused the write (${outcome.code}${outcome.retryAfterSeconds !== undefined ? `, retry after ${outcome.retryAfterSeconds}s` : ''}); nothing was changed`
    );
  }
  stderr(
    `Outcome UNKNOWN (${outcome.cause}): request ${requestId} may or may not have been applied. It will not be resent. Run \`ttr secrets reconcile\`.\n`
  );
  setExitCode(UNKNOWN_OUTCOME_EXIT_CODE);
}

/** Names which file a fixed-text file error is about; the path stays out. */
async function labelled<T>(label: string, run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof SecretsFileError)
      throw new Error(`${label}: ${error.message}`);
    throw error;
  }
}
