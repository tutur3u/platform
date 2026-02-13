import { Plus } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceApiKey } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { getPermissions, verifySecret } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { apiKeyColumns } from './columns';
import ApiKeyEditDialog from './edit-dialog';
import SDKGuide from './sdk-guide';

export const metadata: Metadata = {
  title: 'API Keys',
  description:
    'Manage API Keys in the Workspace Settings area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function WorkspaceApiKeysPage({
  params,
  searchParams,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        if (
          !(await verifySecret({
            forceAdmin: true,
            wsId: wsId,
            name: 'ENABLE_API_KEYS',
            value: 'true',
          }))
        )
          redirect(`/${wsId}/settings`);

        const permissions = await getPermissions({
          wsId,
        });
        if (!permissions) notFound();
        const { withoutPermission } = permissions;

        if (withoutPermission('manage_api_keys')) redirect(`/${wsId}/settings`);

        const [{ data: apiKeys, count }, roles] = await Promise.all([
          getApiKeys(wsId, await searchParams),
          getWorkspaceRoles(wsId),
        ]);
        const t = await getTranslations('ws-api-keys');

        return (
          <>
            <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start">
              <div>
                <h1 className="font-bold text-2xl">{t('api_keys')}</h1>
                <p className="text-foreground/80">{t('description')}</p>
              </div>

              <div className="flex flex-col items-center justify-center gap-2 md:flex-row">
                <ApiKeyEditDialog
                  data={{
                    ws_id: wsId,
                  }}
                  roles={roles}
                  trigger={
                    <Button>
                      <Plus className="mr-2 h-5 w-5" />
                      {t('create_key')}
                    </Button>
                  }
                  submitLabel={t('create_key')}
                />
              </div>
            </div>
            <Separator className="my-4" />
            <TooltipProvider>
              <CustomDataTable
                columnGenerator={apiKeyColumns}
                namespace="api-key-data-table"
                data={apiKeys}
                count={count}
                defaultVisibility={{
                  id: false,
                  created_at: false,
                }}
              />
            </TooltipProvider>
            <div className="my-8">
              <SDKGuide />
            </div>
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getApiKeys(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_api_keys')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  // Fetch last_used_at from usage logs for each API key
  if (data && data.length > 0) {
    const keyIds = data.map((key) => key.id);
    const { data: lastUsedData } = await supabase
      .from('workspace_api_key_usage_logs')
      .select('api_key_id, created_at')
      .in('api_key_id', keyIds)
      .order('created_at', { ascending: false });

    // Create a map of api_key_id to most recent created_at
    const lastUsedMap = new Map<string, string>();
    if (lastUsedData) {
      for (const log of lastUsedData) {
        if (!lastUsedMap.has(log.api_key_id)) {
          lastUsedMap.set(log.api_key_id, log.created_at);
        }
      }
    }

    // Update each API key with its last_used_at from logs
    for (const key of data) {
      key.last_used_at = lastUsedMap.get(key.id) || null;
    }
  }

  return { data, count } as { data: WorkspaceApiKey[]; count: number };
}

async function getWorkspaceRoles(wsId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_roles')
    .select('id, name')
    .eq('ws_id', wsId)
    .order('name', { ascending: true });

  if (error) throw error;

  return data || [];
}
