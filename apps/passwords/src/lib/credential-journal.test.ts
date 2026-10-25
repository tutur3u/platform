import { expect, it } from 'vitest';
import { credentialJournal } from './credential-journal';

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
  return {
    values,
    storage,
    journal: credentialJournal(storage, 'workspace', 'vault'),
  };
}
const ids = {
  grantRequestId: 'f7400000-0000-0000-0000-000000000001',
  tokenRequestId: 'f7400000-0000-0000-0000-000000000002',
};
it('retains both unknown phase identities across remounts and refuses a replacement', () => {
  const { journal, storage, values } = fixture();
  journal.begin(ids);
  expect(credentialJournal(storage, 'workspace', 'vault').read()).toEqual(ids);
  expect([...values.values()]).toEqual([JSON.stringify(ids)]);
  expect(() =>
    journal.begin({ ...ids, tokenRequestId: crypto.randomUUID() })
  ).toThrow();
});
it('never treats a missing token receipt as a failed original issuance', async () => {
  const { journal } = fixture();
  journal.begin(ids);
  await expect(
    journal.reconcile(async (requestId) =>
      requestId === ids.grantRequestId
        ? { found: true, action: 'grant.create' }
        : { found: false }
    )
  ).rejects.toThrow('OPERATION_UNCERTAIN');
  expect(journal.read()).toEqual(ids);
});
it('clears only when both original actions are confirmed', async () => {
  const { journal } = fixture();
  journal.begin(ids);
  expect(
    await journal.reconcile(async (requestId) => ({
      found: true,
      action: requestId === ids.grantRequestId ? 'grant.create' : 'token.issue',
    }))
  ).toBe(true);
  expect(journal.read()).toBeNull();
});
