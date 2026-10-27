import { expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  deleteWorkspaceStorageObjectByPath: vi.fn(),
}));
vi.mock('./cache', () => ({
  invalidateWorkspaceExternalProjectCache: vi.fn(),
}));

import {
  createWorkspaceExternalProjectBlock,
  createWorkspaceExternalProjectFieldDefinition,
  updateWorkspaceExternalProjectFieldDefinition,
} from './store';

function fixture(owned: boolean) {
  const write = vi.fn();
  const from = vi.fn((table: string) => {
    const filters: Record<string, string> = {};
    const query = {
      select: () => query,
      eq: (key: string, value: string) => {
        filters[key] = value;
        return query;
      },
      maybeSingle: async () => ({
        data:
          owned && filters.ws_id === 'workspace-a' && filters.id === 'reference'
            ? { id: 'reference' }
            : null,
        error: null,
      }),
      insert: () => {
        write(table);
        return query;
      },
      update: () => {
        write(table);
        return query;
      },
      single: async () => ({ data: { id: 'saved' }, error: null }),
    };
    return query;
  });
  return { write, db: { from } };
}
const field = {
  workspaceId: 'workspace-a',
  actorId: 'actor',
  key: 'field',
  field_scope: 'entry',
  field_type: 'text',
  collection_id: 'reference',
} as const;
const block = {
  workspaceId: 'workspace-a',
  actorId: 'actor',
  block_type: 'text',
  content: {},
  entry_id: 'reference',
};
for (const action of ['block', 'field-create', 'field-update']) {
  function run(db: ReturnType<typeof fixture>['db']) {
    if (action === 'block')
      return createWorkspaceExternalProjectBlock(block, db as never);
    if (action === 'field-create')
      return createWorkspaceExternalProjectFieldDefinition(field, db as never);
    return updateWorkspaceExternalProjectFieldDefinition(
      'field',
      field,
      db as never
    );
  }
  it(`rejects a foreign reference before ${action}`, async () => {
    const { db, write } = fixture(false);
    await expect(run(db)).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  });
  it(`preserves owned references for ${action}`, async () => {
    const { db, write } = fixture(true);
    await expect(run(db)).resolves.toEqual({ id: 'saved' });
    expect(write).toHaveBeenCalledOnce();
  });
}
