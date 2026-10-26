import { expect, it } from 'vite-plus/test';
import { LedgerCore, MAX_PENDING_WORK, memoryLedgerStore } from './ledger';

it('refuses overflow atomically without evicting the oldest obligations', () => {
  const { store } = memoryLedgerStore();
  const core = new LedgerCore(store);
  const items = Array.from(
    { length: MAX_PENDING_WORK },
    (_, index) => `workspace-${index}`
  );
  core.addPendingWork('job', items);
  expect(() => core.addPendingWork('job', ['overflow'])).toThrow(RangeError);
  expect(new LedgerCore(store).pendingWork('job')).toEqual(items);
});
