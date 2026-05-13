import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { type NextRequest, NextResponse } from 'next/server';
import { backfillHiveProductData } from '@/lib/hive/backfill';
import { serverLogger, withHiveRoute } from '../_shared';

const ROUTE = '/api/v1/hive/backfill';

async function requireBackfillAdmin(request: NextRequest) {
  const supabase = await createClient(request);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const sbAdmin = await createAdminClient();
  const { data: role, error: roleError } = await sbAdmin
    .from('platform_user_roles')
    .select('enabled, allow_role_management')
    .eq('user_id', user.id)
    .maybeSingle();

  if (roleError) {
    serverLogger.error('Failed to resolve Hive backfill admin role', {
      roleError: roleError.message,
    });
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Failed to resolve Hive admin access' },
        { status: 500 }
      ),
    };
  }

  if (!role?.enabled || !role.allow_role_management) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Hive admin access required' },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, sbAdmin };
}

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
  const access = await requireBackfillAdmin(request);
  if (!access.ok) return access.response;

  try {
    const [members, servers, states, events, npcs, memories, runs] =
      await Promise.all([
        readTable(access.sbAdmin, 'hive_members'),
        readTable(access.sbAdmin, 'hive_servers'),
        readTable(access.sbAdmin, 'hive_world_states'),
        readTable(access.sbAdmin, 'hive_world_events'),
        readTable(access.sbAdmin, 'hive_npcs'),
        readTable(access.sbAdmin, 'hive_npc_memories'),
        readTable(access.sbAdmin, 'hive_npc_runs'),
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
