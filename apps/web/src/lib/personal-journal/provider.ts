import { type JournalStore, JournalUnavailable } from './service';

export function getJournalStore(): JournalStore {
  // ROOT must apply the migration and supply generated private RPC types before
  // wiring this provider. An unavailable store must never acknowledge a write.
  throw new JournalUnavailable(
    'Journal schema provider has not been qualified'
  );
}
