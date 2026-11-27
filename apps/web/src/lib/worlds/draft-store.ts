import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database, Json } from '@tuturuuu/types';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { edufestHall } from '@tuturuuu/worlds/edufest-hall';
import {
  parseDraftGeometry,
  parseDraftSave,
  type WorldDraft,
  worldId,
} from './draft-geometry';

type DraftRow = {
  ws_id: string;
  world_id: string;
  revision: number;
  geometry: Json;
};
type DraftDatabase = Omit<Database, 'private'> & {
  private: Database['private'] & {
    Tables: {
      workspace_world_drafts: {
        Row: DraftRow;
        Insert: DraftRow;
        Update: Pick<DraftRow, 'revision' | 'geometry'>;
        Relationships: [];
      };
    };
  };
};

export type DraftResult =
  | { status: 'ok' | 'stale'; draft: WorldDraft }
  | { status: 'forbidden' | 'invalid' | 'unavailable' };

export async function authorizeDraft(wsId: string, request?: Request) {
  const permissions = await getPermissions({
    wsId,
    ...(request && { request }),
  });
  return permissions?.containsPermission('manage_workspace_settings')
    ? permissions.wsId
    : null;
}

async function draftTable() {
  const admin = await createAdminClient({ noCookie: true });
  return (admin as unknown as SupabaseClient<DraftDatabase>)
    .schema('private')
    .from('workspace_world_drafts');
}

export async function readDraft(wsId: string): Promise<DraftResult> {
  const { data, error } = await (
    await draftTable()
  )
    .select('revision,geometry')
    .eq('ws_id', wsId)
    .eq('world_id', worldId)
    .maybeSingle();

  if (error) {
    console.error('World draft read failed', error.code);
    return { status: 'unavailable' };
  }
  if (!data) {
    return { status: 'ok', draft: { revision: 0, world: edufestHall } };
  }
  const draft = parseDraftGeometry(data.geometry);
  if (!draft) {
    console.error('Stored world draft geometry is invalid');
    return { status: 'unavailable' };
  }
  return {
    status: 'ok',
    draft: { revision: data.revision, world: draft.world },
  };
}

export async function writeDraft(
  wsId: string,
  input: unknown
): Promise<DraftResult> {
  const draft = parseDraftSave(input);
  if (!draft) return { status: 'invalid' };

  const table = await draftTable();
  const revision = draft.revision + 1;
  const values = { revision, geometry: draft.geometry };
  const write =
    draft.revision === 0
      ? table.upsert(
          { ...values, ws_id: wsId, world_id: worldId },
          {
            onConflict: 'ws_id,world_id',
            ignoreDuplicates: true,
          }
        )
      : table
          .update(values)
          .eq('ws_id', wsId)
          .eq('world_id', worldId)
          .eq('revision', draft.revision);
  const { data, error } = await write.select('revision').maybeSingle();
  if (error) {
    console.error('World draft write failed', error.code);
    return { status: 'unavailable' };
  }
  if (data) {
    return {
      status: 'ok',
      draft: { revision: data.revision, world: draft.world },
    };
  }

  const current = await readDraft(wsId);
  return current.status === 'ok'
    ? { status: 'stale', draft: current.draft }
    : current;
}
