import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { z } from 'zod';

export const WORKSPACE_MANAGER_GAP_DEFAULT_LIMIT = 50;
export const WORKSPACE_MANAGER_GAP_MAX_LIMIT = 100;

export interface WorkspaceManagerGapRow {
  createdAt: string;
  creatorId: string;
  fullMemberCount: number;
  name: string;
  wsId: string;
}

export interface WorkspaceManagerGapQuery {
  after: string | null;
  limit: number;
}

export type WorkspaceManagerGapQueryResult =
  | { ok: true; query: WorkspaceManagerGapQuery }
  | { ok: false; error: 'invalid_cursor' | 'invalid_limit' };

export type WorkspaceManagerGapPage =
  | { ok: true; nextCursor: string | null; rows: WorkspaceManagerGapRow[] }
  | { ok: false };

const cursorSchema = z.guid();

export function parseWorkspaceManagerGapQuery(input: {
  after?: string | null;
  limit?: string | null;
}): WorkspaceManagerGapQueryResult {
  const after = input.after ?? null;
  if (after !== null && !cursorSchema.safeParse(after).success) {
    return { ok: false, error: 'invalid_cursor' };
  }

  const rawLimit = input.limit ?? null;
  if (rawLimit === null) {
    return {
      ok: true,
      query: { after, limit: WORKSPACE_MANAGER_GAP_DEFAULT_LIMIT },
    };
  }

  const limit = /^\d{1,3}$/.test(rawLimit) ? Number(rawLimit) : Number.NaN;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > WORKSPACE_MANAGER_GAP_MAX_LIMIT
  ) {
    return { ok: false, error: 'invalid_limit' };
  }

  return { ok: true, query: { after, limit } };
}

export async function listWorkspacesWithoutMemberManager(
  db: TypedSupabaseClient,
  query: WorkspaceManagerGapQuery
): Promise<WorkspaceManagerGapPage> {
  const { data, error } = await db
    .schema('private')
    .rpc('list_workspaces_without_member_manager', {
      p_after_ws_id: query.after ?? undefined,
      p_limit: query.limit,
    });

  if (error) {
    console.error('list_workspaces_without_member_manager RPC failed:', error);
    return { ok: false };
  }

  const rows: WorkspaceManagerGapRow[] = (data ?? []).map((row) => ({
    createdAt: row.created_at,
    creatorId: row.creator_id,
    fullMemberCount: Number(row.full_member_count),
    name: row.ws_name,
    wsId: row.ws_id,
  }));
  const lastRow = rows.at(-1);

  return {
    ok: true,
    nextCursor: rows.length === query.limit && lastRow ? lastRow.wsId : null,
    rows,
  };
}
