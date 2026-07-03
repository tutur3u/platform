import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { type NextRequest, NextResponse } from 'next/server';
import { backfillHiveProductData } from '@/lib/hive/backfill';
import { requireHiveAdmin, serverLogger, withHiveRoute } from '../_shared';

const ROUTE = '/api/v1/hive/backfill';

type HiveLegacyTable =
  | 'hive_members'
  | 'hive_npc_memories'
  | 'hive_npc_runs'
  | 'hive_npcs'
  | 'hive_servers'
  | 'hive_world_events'
  | 'hive_world_states';

async function readTable(sbAdmin: TypedSupabaseClient, table: HiveLegacyTable) {
  const { data, error } = await sbAdmin.from(table).select('*');

  if (error) {
    throw new Error(`Failed to read ${table}: ${error.message}`);
  }

  return data ?? [];
}

async function backfill(request: NextRequest) {
  const result = await requireHiveAdmin(request);
  if (!result.ok) return result.response;

  try {
    const [members, servers, states, events, npcs, memories, runs] =
      await Promise.all([
        readTable(result.access.sbAdmin, 'hive_members'),
        readTable(result.access.sbAdmin, 'hive_servers'),
        readTable(result.access.sbAdmin, 'hive_world_states'),
        readTable(result.access.sbAdmin, 'hive_world_events'),
        readTable(result.access.sbAdmin, 'hive_npcs'),
        readTable(result.access.sbAdmin, 'hive_npc_memories'),
        readTable(result.access.sbAdmin, 'hive_npc_runs'),
      ]);

    const counts = await backfillHiveProductData({
      events,
      members,
      memories,
      npcs,
      runs,
      servers,
      states,
    });

    return NextResponse.json({ counts });
  } catch (error) {
    serverLogger.error('Hive backfill failed', error);
    return NextResponse.json(
      { error: 'Failed to backfill Hive product data' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return withHiveRoute(request, ROUTE, () => backfill(request));
}
