import 'server-only';

import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database, Json } from '@tuturuuu/types';
import { z } from 'zod';
import {
  CitationLibraryError,
  type CitationLibraryScope,
  type CitationLibraryStore,
  citationLibraryItemSchema,
} from './contracts';

type AccessArgs = { p_ws_id: string; p_actor_id: string };
type ItemArgs = AccessArgs & { p_id: string };
type EditArgs = ItemArgs & {
  p_work: Json;
  p_fingerprint: string;
  p_tags: string[];
};
type VersionedArgs = ItemArgs & { p_expected_version: number };

const rowSchema = z.object({
  id: z.uuid(),
  ws_id: z.uuid(),
  owner_user_id: z.uuid().nullable(),
  work: z.unknown(),
  fingerprint: z.string(),
  tags: z.array(z.string()),
  version: z.number(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

type Row = z.infer<typeof rowSchema>;
const rpcRowsSchema = z.array(rowSchema);
type PrivateSchema = Database['private'];

// The RPC contract can be used before the generated snapshot includes the
// migration. Keep the runtime decoder at the PostgREST boundary.
export type CitationLibraryDatabase = Omit<Database, 'private'> & {
  private: Omit<PrivateSchema, 'Functions'> & {
    Functions: PrivateSchema['Functions'] & {
      list_citation_library_items: {
        Args: AccessArgs & { p_limit: number; p_offset: number; p_search: string };
        Returns: Row[];
      };
      lookup_citation_library_items: {
        Args: AccessArgs & ({ p_ids: string[] } | { p_fingerprint: string });
        Returns: Row[];
      };
      insert_citation_library_item: { Args: EditArgs; Returns: Row[] };
      update_citation_library_item: {
        Args: EditArgs & VersionedArgs;
        Returns: Row[];
      };
      delete_citation_library_item: { Args: VersionedArgs; Returns: boolean };
    };
  };
};

function unavailable() {
  return new CitationLibraryError('LIBRARY_UNAVAILABLE', 503);
}

function checkError(error: { code: string; message: string } | null) {
  if (!error) return;
  if (error.code === '42501') throw new CitationLibraryError('FORBIDDEN', 403);
  if (error.code === '23505') {
    if (
      error.message.includes('"citation_library_items_workspace_fingerprint_key"')
    ) {
      throw new CitationLibraryError('DUPLICATE_SOURCE', 409);
    }
    if (error.message.includes('"citation_library_items_pkey"')) {
      throw new CitationLibraryError('VERSION_CONFLICT', 409);
    }
  }
  if (error.code === '23514') {
    if (error.message.includes('"citation_library_items_work_size_check"')) {
      throw new CitationLibraryError('INVALID_INPUT', 413);
    }
    throw new CitationLibraryError('INVALID_INPUT', 400);
  }
  if (['22023', '22P02', '22P05'].includes(error.code)) {
    throw new CitationLibraryError('INVALID_INPUT', 400);
  }
  throw unavailable();
}

function readRows(
  wsId: string,
  result: { data: unknown; error: { code: string; message: string } | null }
) {
  checkError(result.error);
  const rows = rpcRowsSchema.safeParse(result.data);
  if (!rows.success) throw unavailable();
  return rows.data.map((row) => {
    const item = citationLibraryItemSchema.safeParse({
      id: row.id,
      wsId: row.ws_id,
      ownerUserId: row.owner_user_id,
      work: row.work,
      fingerprint: row.fingerprint,
      tags: row.tags,
      version: row.version,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    });
    if (!item.success || item.data.wsId !== wsId) throw unavailable();
    return item.data;
  });
}

function atMostOne<T>(rows: T[]): T | null {
  if (rows.length > 1) throw unavailable();
  return rows[0] ?? null;
}

export function getCitationLibraryStore(
  client: SupabaseClient<CitationLibraryDatabase>,
  scope: CitationLibraryScope
): CitationLibraryStore {
  const db = client.schema('private');
  function access(wsId: string): AccessArgs {
    if (wsId !== scope.wsId) throw new CitationLibraryError('FORBIDDEN', 403);
    return { p_ws_id: scope.wsId, p_actor_id: scope.actorId };
  }

  async function getMany(wsId: string, ids: string[]) {
    return readRows(
      wsId,
      await db.rpc('lookup_citation_library_items', {
        ...access(wsId),
        p_ids: ids,
      })
    );
  }

  return {
    async list(wsId, query) {
      return readRows(
        wsId,
        await db.rpc('list_citation_library_items', {
          ...access(wsId),
          p_limit: query.limit,
          p_offset: query.offset,
          p_search: query.search,
        })
      );
    },
    async get(wsId, id) {
      return atMostOne(await getMany(wsId, [id]));
    },
    getMany,
    async findFingerprint(wsId, fingerprint) {
      return atMostOne(
        readRows(
          wsId,
          await db.rpc('lookup_citation_library_items', {
            ...access(wsId),
            p_fingerprint: fingerprint,
          })
        )
      );
    },
    async insert(owner, item) {
      if (owner.actorId !== scope.actorId)
        throw new CitationLibraryError('FORBIDDEN', 403);
      const row = atMostOne(
        readRows(
          owner.wsId,
          await db.rpc('insert_citation_library_item', {
            ...access(owner.wsId),
            p_id: item.id,
            p_work: item.work,
            p_fingerprint: item.fingerprint,
            p_tags: item.tags,
          })
        )
      );
      if (!row || row.ownerUserId !== scope.actorId) throw unavailable();
      return row;
    },
    async update(wsId, id, item) {
      return atMostOne(
        readRows(
          wsId,
          await db.rpc('update_citation_library_item', {
            ...access(wsId),
            p_id: id,
            p_expected_version: item.expectedVersion,
            p_work: item.work,
            p_fingerprint: item.fingerprint,
            p_tags: item.tags,
          })
        )
      );
    },
    async remove(wsId, id, expectedVersion) {
      const { data, error } = await db.rpc('delete_citation_library_item', {
        ...access(wsId),
        p_id: id,
        p_expected_version: expectedVersion,
      });
      checkError(error);
      if (typeof data !== 'boolean') throw unavailable();
      return data;
    },
  };
}
