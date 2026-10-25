import { constants } from 'node:fs';
import { open, stat, unlink } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  readRegularFile,
  SecretsFileError,
  wipe,
  writePrivateFile,
} from './secrets-files';

const MAX_JOURNAL_BYTES = 64 * 1024;
const MAX_ENTRIES = 64;
const LOCK_TRIES = 40;
const LOCK_RETRY_MS = 50;
const LOCK_STALE_MS = 30_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface JournalEntry {
  requestId: string;
  action: 'put' | 'rotate';
  /** Label only. Never a value, a content hash or a key suffix. */
  name?: string;
  workspaceId: string;
  vaultId: string;
  startedAt: string;
  /** `pending` survives a crash before an answer and counts as unresolved. */
  state: 'pending' | 'unknown';
}

export type JournalFailure = 'blocked' | 'corrupt' | 'busy' | 'full' | 'io';

const MESSAGES: Record<JournalFailure, string> = {
  blocked:
    'An earlier write has an unresolved outcome; run `ttr secrets reconcile` before writing again',
  corrupt:
    'The operation journal is unreadable; writes stay blocked until it is repaired',
  busy: 'The operation journal is in use by another ttr process',
  full: 'The operation journal is full of unresolved writes; run `ttr secrets reconcile`',
  io: 'The operation journal could not be saved; no write was sent',
};

export class SecretsJournalError extends Error {
  constructor(
    readonly reason: JournalFailure,
    readonly unresolved: JournalEntry[] = []
  ) {
    super(MESSAGES[reason]);
    this.name = 'SecretsJournalError';
  }
}

function text(value: unknown, pattern?: RegExp) {
  return typeof value === 'string' &&
    value.length <= 256 &&
    (!pattern || pattern.test(value))
    ? value
    : undefined;
}

function parseEntry(raw: unknown): JournalEntry {
  const value = raw as Record<string, unknown> | null;
  const requestId = text(value?.requestId, UUID);
  const workspaceId = text(value?.workspaceId, UUID);
  const vaultId = text(value?.vaultId, UUID);
  const startedAt = text(value?.startedAt);
  const name = value?.name === undefined ? undefined : text(value.name);
  if (
    !value ||
    !requestId ||
    !workspaceId ||
    !vaultId ||
    !startedAt ||
    (value.action !== 'put' && value.action !== 'rotate') ||
    (value.state !== 'pending' && value.state !== 'unknown') ||
    (value.name !== undefined && name === undefined)
  )
    throw new SecretsJournalError('corrupt');
  return {
    requestId,
    action: value.action,
    name,
    workspaceId,
    vaultId,
    startedAt,
    state: value.state,
  };
}

/**
 * Private durable record of mutations whose outcome may be unknown. It holds
 * identifiers, the action and a label only. It never holds values, content
 * fingerprints or token material.
 */
export class OperationJournal {
  constructor(readonly path: string) {}

  static pathFor(credentialsPath: string) {
    return `${credentialsPath}.journal`;
  }

  async unresolved(workspaceId: string, vaultId: string) {
    return (await this.#read()).filter(
      (entry) => entry.workspaceId === workspaceId && entry.vaultId === vaultId
    );
  }

  /** Records `pending` unless an earlier write for the same vault is unresolved. */
  async begin(entry: Omit<JournalEntry, 'state'>) {
    await this.#locked(async () => {
      const entries = await this.#read();
      const blocking = entries.filter(
        (other) =>
          other.workspaceId === entry.workspaceId &&
          other.vaultId === entry.vaultId
      );
      if (blocking.length > 0)
        throw new SecretsJournalError('blocked', blocking);
      if (entries.length >= MAX_ENTRIES) throw new SecretsJournalError('full');
      await this.#write([...entries, { ...entry, state: 'pending' }]);
    });
  }

  async markUnknown(requestId: string) {
    await this.#update(requestId, (entry) => ({ ...entry, state: 'unknown' }));
  }

  /** Drops an entry only once its outcome is known. */
  async resolve(requestId: string) {
    await this.#update(requestId, () => undefined);
  }

  async #update(
    requestId: string,
    change: (entry: JournalEntry) => JournalEntry | undefined
  ) {
    await this.#locked(async () => {
      const next: JournalEntry[] = [];
      for (const entry of await this.#read()) {
        if (entry.requestId !== requestId) next.push(entry);
        else {
          const changed = change(entry);
          if (changed) next.push(changed);
        }
      }
      await this.#write(next);
    });
  }

  async #read() {
    let bytes: Buffer;
    try {
      bytes = await readRegularFile(this.path, {
        maxBytes: MAX_JOURNAL_BYTES,
        requirePrivate: true,
      });
    } catch (error) {
      if (error instanceof SecretsFileError && error.reason === 'unreadable') {
        // Distinguish a missing journal (empty) from an unreadable one.
        if (
          !(await stat(this.path).then(
            () => true,
            () => false
          ))
        )
          return [];
      }
      throw new SecretsJournalError('corrupt');
    }
    try {
      const parsed = JSON.parse(bytes.toString('utf8')) as {
        version?: unknown;
        entries?: unknown;
      };
      if (
        parsed?.version !== 1 ||
        !Array.isArray(parsed.entries) ||
        parsed.entries.length > MAX_ENTRIES
      )
        throw new SecretsJournalError('corrupt');
      return parsed.entries.map(parseEntry);
    } catch (error) {
      throw error instanceof SecretsJournalError
        ? error
        : new SecretsJournalError('corrupt');
    } finally {
      wipe(bytes);
    }
  }

  async #write(entries: JournalEntry[]) {
    const bytes = Buffer.from(
      `${JSON.stringify({ version: 1, entries }, null, 2)}\n`
    );
    try {
      await writePrivateFile(this.path, bytes, { replace: true });
    } catch {
      throw new SecretsJournalError('io');
    }
  }

  async #locked<T>(run: () => Promise<T>) {
    const lock = `${this.path}.lock`;
    for (let attempt = 0; ; attempt++) {
      try {
        const handle = await open(
          lock,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o600
        );
        await handle.close();
        break;
      } catch (error) {
        const code =
          error instanceof Error && 'code' in error ? error.code : '';
        if (code !== 'EEXIST') throw new SecretsJournalError('io');
        const age = await stat(lock).then(
          (info) => Date.now() - info.mtimeMs,
          () => 0
        );
        if (age > LOCK_STALE_MS) await unlink(lock).catch(() => undefined);
        else if (attempt >= LOCK_TRIES) throw new SecretsJournalError('busy');
        else await sleep(LOCK_RETRY_MS);
      }
    }
    try {
      return await run();
    } finally {
      await unlink(lock).catch(() => undefined);
    }
  }
}
