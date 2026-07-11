import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { LimitRow } from '@tuturuuu/types/db';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { enforceRootWorkspaceAdmin } from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import {
  type AvailableTableRow,
  buildTableGroups,
} from '@/app/[locale]/(dashboard)/[wsId]/entity-creation-limits/types';

async function getLimitRows(): Promise<LimitRow[]> {
  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .from('platform_entity_creation_limits')
    .select('*')
    .order('table_name', { ascending: true })
    .order('tier', { ascending: true });

  if (error) throw error;

  return data ?? [];
}

async function getAvailableTables(): Promise<AvailableTableRow[]> {
  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin.rpc(
    'get_available_platform_entity_limit_tables'
  );

  if (error) throw error;

  return (data ?? []) as AvailableTableRow[];
}

export async function GET() {
  await connection();

  await enforceRootWorkspaceAdmin(ROOT_WORKSPACE_ID);

  const [rows, availableTables] = await Promise.all([
    getLimitRows(),
    getAvailableTables(),
  ]);

  return NextResponse.json({
    availableTables,
    tableGroups: buildTableGroups(rows),
  });
}
