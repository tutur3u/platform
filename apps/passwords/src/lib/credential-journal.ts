import type { OperationObservation } from '../service/port';
import type { JournalStorage } from './operation-journal';

type Pending = { grantRequestId: string; tokenRequestId: string };
const id = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function credentialJournal(
  storage: JournalStorage,
  wsId: string,
  vaultId: string
) {
  const key = `passwords.credentials.v1:${wsId}:${vaultId}`;
  return {
    read(): Pending | null {
      const raw = storage.getItem(key);
      if (raw === null) return null;
      const value = JSON.parse(raw);
      if (
        !value ||
        typeof value.grantRequestId !== 'string' ||
        typeof value.tokenRequestId !== 'string' ||
        !id.test(value.grantRequestId) ||
        !id.test(value.tokenRequestId) ||
        value.grantRequestId === value.tokenRequestId
      )
        throw new Error('OPERATION_UNCERTAIN');
      return {
        grantRequestId: value.grantRequestId,
        tokenRequestId: value.tokenRequestId,
      };
    },
    begin(value: Pending) {
      if (this.read()) throw new Error('OPERATION_UNCERTAIN');
      storage.setItem(key, JSON.stringify(value));
    },
    clear() {
      storage.removeItem(key);
    },
    async reconcile(
      observe: (requestId: string) => Promise<OperationObservation>
    ) {
      const pending = this.read();
      if (!pending) return false;
      const grant = await observe(pending.grantRequestId);
      const token = await observe(pending.tokenRequestId);
      if (
        !grant.found ||
        grant.action !== 'grant.create' ||
        !token.found ||
        token.action !== 'token.issue'
      )
        throw new Error('OPERATION_UNCERTAIN');
      this.clear();
      return true;
    },
  };
}
