import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  deleteWorkspaceStorageObjectByPath: vi.fn(),
}));

const WS = 'workspace-1';
const STAMP = '2026-01-01T00:00:00Z';

function collection(id: string, config: Record<string, unknown> = {}) {
  return {
    collection_type: id,
    config,
    created_at: STAMP,
    created_by: null,
    description: null,
    id,
    is_enabled: true,
    slug: id,
    title: id,
    updated_at: STAMP,
    updated_by: null,
    ws_id: WS,
  };
}

function entry(
  id: string,
  collectionId: string,
  metadata: Record<string, unknown> = {}
) {
  return {
    collection_id: collectionId,
    created_at: STAMP,
    created_by: null,
    id,
    metadata,
    profile_data: {},
    published_at: STAMP,
    scheduled_for: null,
    slug: id,
    sort_order: 0,
    source_adapter: null,
    stable_source_id: null,
    status: 'published',
    subtitle: null,
    summary: null,
    title: id,
    updated_at: STAMP,
    updated_by: null,
    ws_id: WS,
  };
}

function definition(
  id: string,
  sourceCollectionId: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    cardinality: 'many',
    created_at: STAMP,
    created_by: null,
    id,
    inverse_label: 'Student of',
    is_required: false,
    key: `${id}-key`,
    label: 'Mentor of',
    sort_order: 0,
    source_collection_id: sourceCollectionId,
    updated_at: STAMP,
    updated_by: null,
    ws_id: WS,
    ...overrides,
  };
}

function target(definitionId: string, collectionId: string) {
  return {
    created_at: STAMP,
    id: `${definitionId}-${collectionId}`,
    relation_definition_id: definitionId,
    target_collection_id: collectionId,
    ws_id: WS,
  };
}

function relation(
  id: string,
  from: string,
  to: string,
  definitionId: string | null,
  sortOrder = 0
) {
  return {
    created_at: STAMP,
    from_entry_id: from,
    id,
    metadata: { direction: 'forward', kind: 'mentor', note: 'since book one' },
    relation_definition_id: definitionId,
    relation_type: definitionId ? `${definitionId}-key` : 'legacy',
    sort_order: sortOrder,
    to_entry_id: to,
    ws_id: WS,
  };
}

type Tables = Partial<Record<string, unknown[]>>;

/** The payload fields these tests read, typed locally. */
type DeliveryPayload = {
  collections: Array<{
    entries: Array<{ id: string; relations: unknown[] }>;
  }>;
  generatedAt: string;
  relationDefinitions?: Array<{ id: string }>;
  revision: string;
  template?: unknown;
};

function createDb(tables: Tables) {
  const eqCalls: Array<[table: string, column: string, value: unknown]> = [];
  const db: Record<string, unknown> = {
    // Publication proofs live in the private schema; none exist here.
    schema: () => db,
    from: vi.fn((table: string) => ({
      select: vi.fn(() => {
        const result = { data: tables[table] ?? [], error: null };
        const query = {
          eq: vi.fn((column: string, value: unknown) => {
            eqCalls.push([table, column, value]);
            return query;
          }),
          gt: vi.fn(() => query),
          in: vi.fn(() => query),
          limit: vi.fn(() => query),
          order: vi.fn(() => query),
          range: vi.fn(() => query),
        };
        Object.defineProperty(query, 'then', {
          value: (
            resolve: (value: unknown) => unknown,
            reject?: (reason: unknown) => unknown
          ) => Promise.resolve(result).then(resolve, reject),
        });
        return query;
      }),
    })),
  };
  return { db, eqCalls };
}

async function build(tables: Tables) {
  const { buildWorkspaceExternalProjectDeliveryPayload } =
    await import('./store');
  const { db, eqCalls } = createDb(tables);
  const payload = await buildWorkspaceExternalProjectDeliveryPayload(
    {
      binding: {
        adapter: 'richfield',
        canonical_id: 'richfield-main',
        canonical_project: {
          adapter: 'richfield',
          allowed_collections: [],
          allowed_features: [],
          created_at: STAMP,
          created_by: null,
          delivery_profile: {},
          display_name: 'Richfield',
          id: 'richfield-main',
          is_active: true,
          metadata: {},
          updated_at: STAMP,
          updated_by: null,
        },
        enabled: true,
        workspace_id: WS,
      },
      includeDrafts: false,
      workspaceId: WS,
    },
    db as never
  );
  return { eqCalls, payload: payload as DeliveryPayload };
}

const baseTables: Tables = {
  workspace_external_project_collections: [
    collection('characters'),
    collection('inbox', { privateDelivery: true }),
  ],
  workspace_external_project_entries: [
    entry('kyrian', 'characters'),
    entry('mira', 'characters'),
    entry('inbox-1', 'inbox'),
  ],
};

describe('delivery relations', () => {
  it('keeps a payload without relation definitions in its original shape and revision', async () => {
    const { payload } = await build(baseTables);

    expect(payload).not.toHaveProperty('relationDefinitions');
    expect(
      payload.collections.flatMap((item) =>
        item.entries.map((row) => row.relations)
      )
    ).toEqual([[], []]);
    const templateHash = createHash('sha256')
      .update(JSON.stringify(payload.template ?? null))
      .digest('hex')
      .slice(0, 12);
    expect(payload.revision).toBe(`20260101000000-${templateHash}`);
  });

  it('delivers typed relations between published entries with their definitions', async () => {
    const { eqCalls, payload } = await build({
      ...baseTables,
      workspace_external_project_entry_relations: [
        relation('r-1', 'kyrian', 'mira', 'mentor', 2),
        // The far end is a draft, so it is not among the delivered entries.
        relation('r-draft', 'kyrian', 'draft-entry', 'mentor'),
        // The far end is in a private collection.
        relation('r-private', 'kyrian', 'inbox-1', 'mentor'),
        // Untyped relations have no definition to describe them.
        relation('r-untyped', 'kyrian', 'mira', null),
      ],
      workspace_external_project_relation_definition_targets: [
        target('mentor', 'characters'),
        target('mentor', 'inbox'),
        target('inbox-link', 'characters'),
      ],
      workspace_external_project_relation_definitions: [
        definition('mentor', 'characters'),
        definition('inbox-link', 'inbox'),
      ],
    });

    const kyrian = payload.collections[0]?.entries.find(
      (row) => row.id === 'kyrian'
    );
    expect(kyrian?.relations).toEqual([
      {
        definitionId: 'mentor',
        id: 'r-1',
        key: 'mentor-key',
        metadata: {
          direction: 'forward',
          kind: 'mentor',
          note: 'since book one',
        },
        relation_definition_id: 'mentor',
        relation_type: 'mentor-key',
        sort_order: 2,
        to_entry_id: 'mira',
      },
    ]);
    expect(payload.relationDefinitions).toEqual([
      {
        cardinality: 'many',
        id: 'mentor',
        inverse_label: 'Student of',
        is_required: false,
        key: 'mentor-key',
        label: 'Mentor of',
        sort_order: 0,
        source_collection_id: 'characters',
        target_collection_ids: ['characters'],
      },
    ]);
    for (const table of [
      'workspace_external_project_relation_definitions',
      'workspace_external_project_relation_definition_targets',
      'workspace_external_project_entry_relations',
    ]) {
      expect(eqCalls).toContainEqual([table, 'ws_id', WS]);
    }
  });

  it('changes the revision when a definition label or target changes', async () => {
    const tables = (label: string, targets: string[]): Tables => ({
      ...baseTables,
      workspace_external_project_relation_definition_targets: targets.map(
        (collectionId) => target('mentor', collectionId)
      ),
      workspace_external_project_relation_definitions: [
        definition('mentor', 'characters', { label }),
      ],
    });

    const original = await build(tables('Mentor of', ['characters']));
    const relabelled = await build(tables('Teacher of', ['characters']));
    const retargeted = await build(tables('Mentor of', []));

    expect(relabelled.payload.revision).not.toBe(original.payload.revision);
    // With no delivered target left the definition is not delivered at all.
    expect(retargeted.payload).not.toHaveProperty('relationDefinitions');
    expect(retargeted.payload.revision).not.toBe(original.payload.revision);
    expect((await build(tables('Mentor of', ['characters']))).payload).toEqual(
      original.payload
    );
  });

  it('keeps the revision stable whatever order definitions are read in', async () => {
    const definitions = [
      definition('mentor-a', 'characters', { key: 'mentor' }),
      definition('mentor-b', 'places', { key: 'mentor' }),
      definition('ally', 'characters', { key: 'ally', sort_order: 1 }),
    ];
    const tables = (rows: unknown[]): Tables => ({
      ...baseTables,
      workspace_external_project_collections: [
        ...(baseTables.workspace_external_project_collections ?? []),
        collection('places'),
      ],
      workspace_external_project_relation_definition_targets: [
        target('mentor-a', 'characters'),
        target('mentor-b', 'characters'),
        target('ally', 'characters'),
      ],
      workspace_external_project_relation_definitions: rows,
    });

    const forward = await build(tables(definitions));
    const reversed = await build(tables([...definitions].reverse()));

    expect(reversed.payload.revision).toBe(forward.payload.revision);
    expect(forward.payload.relationDefinitions?.map((item) => item.id)).toEqual(
      ['mentor-a', 'mentor-b', 'ally']
    );
  });

  it('drops relations to an entry flagged private', async () => {
    const { payload } = await build({
      ...baseTables,
      workspace_external_project_entries: [
        entry('kyrian', 'characters'),
        entry('mira', 'characters', { privateDelivery: true }),
      ],
      workspace_external_project_entry_relations: [
        relation('r-1', 'kyrian', 'mira', 'mentor'),
      ],
      workspace_external_project_relation_definition_targets: [
        target('mentor', 'characters'),
      ],
      workspace_external_project_relation_definitions: [
        definition('mentor', 'characters'),
      ],
    });

    expect(
      payload.collections.flatMap((item) =>
        item.entries.flatMap((row) => row.relations)
      )
    ).toEqual([]);
  });

  it('keeps the original shape when every definition starts in a private collection', async () => {
    const plain = await build(baseTables);
    const { payload } = await build({
      ...baseTables,
      workspace_external_project_relation_definition_targets: [
        target('inbox-link', 'characters'),
        target('inbox-only', 'inbox'),
      ],
      workspace_external_project_relation_definitions: [
        // A later edit to a private definition must not show in the revision.
        definition('inbox-link', 'inbox', {
          updated_at: '2026-06-01T00:00:00Z',
        }),
        // Neither may one whose only target is private.
        definition('inbox-only', 'characters', {
          updated_at: '2026-07-01T00:00:00Z',
        }),
      ],
    });

    expect(payload).not.toHaveProperty('relationDefinitions');
    expect(payload.revision).toBe(plain.payload.revision);
    expect(payload.generatedAt).toBe(plain.payload.generatedAt);
  });
});
