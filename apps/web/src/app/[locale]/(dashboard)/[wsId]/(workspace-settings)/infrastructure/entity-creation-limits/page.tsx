import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { LimitRow } from '@tuturuuu/types/db';
import { enforceRootWorkspaceAdmin } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import EntityCreationLimitsClient from './client';
import { type AvailableTableRow, buildTableGroups } from './types';

export const metadata: Metadata = {
  title: 'Entity Creation Limits',
  description:
    'Configure opt-in table creation limits in the Infrastructure area of your Tuturuuu workspace.',
};

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

interface Props {
  params: Promise<{ wsId: string }>;
}

export default async function EntityCreationLimitsPage({ params }: Props) {
  const { wsId } = await params;
  await enforceRootWorkspaceAdmin(wsId, {
    redirectTo: `/${wsId}/settings`,
  });

  const t = await getTranslations('entity-creation-limits');

  const [rows, availableTables] = await Promise.all([
    getLimitRows(),
    getAvailableTables(),
  ]);
  const tableGroups = buildTableGroups(rows);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start">
        <div>
          <h1 className="font-bold text-2xl">{t('title')}</h1>
          <p className="text-foreground/80">{t('description')}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-72">
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <div className="text-muted-foreground text-xs uppercase tracking-wide">
              {t('summary.configured_tables')}
            </div>
            <div className="font-semibold text-lg">{tableGroups.length}</div>
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <div className="text-muted-foreground text-xs uppercase tracking-wide">
              {t('summary.available_tables')}
            </div>
            <div className="font-semibold text-lg">
              {availableTables.length}
            </div>
          </div>
        </div>
      </div>

      <EntityCreationLimitsClient
        wsId={wsId}
        tableGroups={tableGroups}
        availableTables={availableTables}
      />
    </div>
  );
}
