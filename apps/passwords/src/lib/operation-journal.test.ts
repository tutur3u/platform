import { describe, expect, it } from 'vitest';
import { operationJournal, type PendingOperation } from './operation-journal';

const entry: PendingOperation = {
  wsId: 'workspace',
  vaultId: 'f7200000-0000-0000-0000-000000000001',
  requestId: 'f7400000-0000-0000-0000-000000000001',
  action: 'item.write',
};
function fixture() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  return { values, storage, journal: operationJournal(storage, entry.wsId) };
}
describe('operation journal', () => {
  it('retains an uncertain write across remounts and blocks a changed request', () => {
    const { journal, storage } = fixture();
    journal.begin(entry);
    const reloaded = operationJournal(storage, entry.wsId);
    expect(reloaded.read()).toEqual(entry);
    expect(() =>
      reloaded.begin({ ...entry, requestId: crypto.randomUUID() })
    ).toThrow('OPERATION_UNCERTAIN');
    expect(reloaded.read()).toEqual(entry);
  });
  it('only removes the original request after its receipt is confirmed', () => {
    const { journal } = fixture();
    journal.begin(entry);
    expect(() => journal.complete(crypto.randomUUID())).toThrow(
      'OPERATION_UNCERTAIN'
    );
    expect(journal.read()).toEqual(entry);
    journal.complete(entry.requestId);
    expect(journal.read()).toBeNull();
  });
  it('persists metadata only and scopes independent workspaces', () => {
    const { journal, storage, values } = fixture();
    journal.begin(entry);
    expect([...values.values()]).toEqual([JSON.stringify(entry)]);
    expect(operationJournal(storage, 'other').read()).toBeNull();
  });
  it('fails closed on corrupt or unavailable storage', () => {
    const { journal, storage } = fixture();
    storage.setItem('passwords.pending.v1:workspace', '{"action":"unknown"}');
    expect(() => journal.begin(entry)).toThrow('OPERATION_UNCERTAIN');
    const blocked = operationJournal(
      {
        ...storage,
        setItem() {
          throw new Error('quota');
        },
      },
      'other'
    );
    expect(() => blocked.begin({ ...entry, wsId: 'other' })).toThrow();
  });
});
