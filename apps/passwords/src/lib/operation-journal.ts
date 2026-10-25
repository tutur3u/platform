export type WriteAction =
  | 'vault.create'
  | 'item.write'
  | 'member.set'
  | 'vault.rotate';
export interface PendingOperation {
  wsId: string;
  vaultId: string;
  requestId: string;
  action: WriteAction;
}
export interface JournalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
const prefix = 'passwords.pending.v1:';
const actions: readonly string[] = [
  'vault.create',
  'item.write',
  'member.set',
  'vault.rotate',
];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only operation identity is persisted. Secret bytes and form input never enter this journal. */
export function operationJournal(storage: JournalStorage, wsId: string) {
  const key = prefix + wsId;
  return {
    read(): PendingOperation | null {
      const raw = storage.getItem(key);
      if (raw === null) return null;
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== 'object')
        throw new Error('OPERATION_UNCERTAIN');
      const entry = value as Record<string, unknown>;
      if (
        entry.wsId !== wsId ||
        typeof entry.vaultId !== 'string' ||
        !uuid.test(entry.vaultId) ||
        typeof entry.requestId !== 'string' ||
        !uuid.test(entry.requestId) ||
        typeof entry.action !== 'string' ||
        !actions.includes(entry.action)
      )
        throw new Error('OPERATION_UNCERTAIN');
      return {
        wsId,
        vaultId: entry.vaultId,
        requestId: entry.requestId,
        action: entry.action as WriteAction,
      };
    },
    begin(entry: PendingOperation) {
      if (this.read()) throw new Error('OPERATION_UNCERTAIN');
      storage.setItem(key, JSON.stringify(entry));
    },
    complete(requestId: string) {
      if (this.read()?.requestId !== requestId)
        throw new Error('OPERATION_UNCERTAIN');
      storage.removeItem(key);
    },
  };
}
