import type {
  JournalCreate,
  JournalEntry,
  JournalUpdate,
} from '@tuturuuu/internal-api/personal-journal';

export type JournalScope = Readonly<{ actorId: string; workspaceId: string }>;
export class JournalUnavailable extends Error {}
export class JournalConflict extends Error {}
export class JournalForbidden extends Error {}
export class JournalNotFound extends Error {}

export interface JournalStore {
  list(
    scope: JournalScope,
    before?: string
  ): Promise<{ items: JournalEntry[]; nextBefore: string | null }>;
  read(scope: JournalScope, id: string): Promise<JournalEntry | null>;
  create(scope: JournalScope, input: JournalCreate): Promise<JournalEntry>;
  update(
    scope: JournalScope,
    id: string,
    input: JournalUpdate
  ): Promise<JournalEntry>;
}

function owned(scope: JournalScope, entry: JournalEntry) {
  if (
    entry.actorId !== scope.actorId ||
    entry.workspaceId !== scope.workspaceId
  )
    throw new JournalForbidden();
  return entry;
}
export function journalService(store: JournalStore, scope: JournalScope) {
  return {
    async list(before?: string) {
      const page = await store.list(scope, before);
      return { ...page, items: page.items.map((entry) => owned(scope, entry)) };
    },
    async read(id: string) {
      const entry = await store.read(scope, id);
      if (!entry) throw new JournalNotFound();
      if (entry.id !== id) throw new JournalForbidden();
      return owned(scope, entry);
    },
    async create(input: JournalCreate) {
      const entry = owned(scope, await store.create(scope, input));
      if (entry.id !== input.id) throw new JournalForbidden();
      return entry;
    },
    async update(id: string, input: JournalUpdate) {
      const entry = owned(scope, await store.update(scope, id, input));
      if (entry.id !== id) throw new JournalForbidden();
      return entry;
    },
  };
}
