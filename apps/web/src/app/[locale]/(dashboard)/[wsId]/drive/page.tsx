import {
  createClient,
  createDynamicClient,
} from '@tuturuuu/supabase/next/server';
import {
  EMPTY_FOLDER_PLACEHOLDER_NAME,
  type StorageObject,
} from '@tuturuuu/types/primitives/StorageObject';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { formatBytes } from '@/utils/file-helper';
import { joinPath } from '@/utils/path-helper';
import DriveBreadcrumbs from './breadcrumbs';
import NewActions from './new-actions';
import StorageObjectsTable from './table';

export const metadata: Metadata = {
  title: 'Drive',
  description: 'Manage Drive in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
    path?: string;
  }>;
}

export default async function WorkspaceStorageObjectsPage({
  params,
  searchParams,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const { withoutPermission } = await getPermissions({
          wsId,
        });
        const t = await getTranslations();
        const { path } = await searchParams;

        if (withoutPermission('manage_drive')) redirect(`/${wsId}`);

        const { data } = await getData(wsId, await searchParams);

        const count = (await getFileCount(wsId)) ?? 0;
        const totalSize = (await getTotalSize(wsId)) ?? 0;
        const largestFile = await getLargestFile(wsId);
        const smallestFile = await getSmallestFile(wsId);

        // Get storage limit from workspace_secrets or use 100MB default
        const STORAGE_LIMIT = (await getStorageLimit(wsId)) ?? 104857600; // 100MB default
        const usagePercent = Math.min(
          100,
          Math.round((totalSize / STORAGE_LIMIT) * 100)
        );
        const storageLimitDisplay = formatBytes(STORAGE_LIMIT);

        return (
          <>
            {/* Breadcrumb Navigation */}
            <DriveBreadcrumbs wsId={wsId} path={path} />

            <FeatureSummary
              pluralTitle={t('ws-storage-objects.plural')}
              singularTitle={t('ws-storage-objects.singular')}
              description={t('ws-storage-objects.description')}
              createTitle={t('ws-storage-objects.upload')}
              createDescription={t('ws-storage-objects.upload_description')}
              action={<NewActions wsId={wsId} path={path} />}
            />

            <Separator className="my-6" />

            {/* Minimal Storage Usage Bar */}
            <div className="mb-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1 font-medium text-muted-foreground text-xs">
                  Storage
                  {usagePercent >= 80 && usagePercent < 95 && (
                    <svg
                      className="h-3.5 w-3.5 text-dynamic-orange"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      role="img"
                      aria-label="Storage warning"
                    >
                      <title>Storage warning</title>
                      <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm.75 11.25a.75.75 0 01-1.5 0v-1.5a.75.75 0 011.5 0v1.5zm0-4.5a.75.75 0 01-1.5 0V7a.75.75 0 011.5 0v1.75z" />
                    </svg>
                  )}
                  {usagePercent >= 95 && (
                    <svg
                      className="h-3.5 w-3.5 text-dynamic-red"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      role="img"
                      aria-label="Storage critical"
                    >
                      <title>Storage critical</title>
                      <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm.75 11.25a.75.75 0 01-1.5 0v-1.5a.75.75 0 011.5 0v1.5zm0-4.5a.75.75 0 01-1.5 0V7a.75.75 0 011.5 0v1.75z" />
                    </svg>
                  )}
                </span>
                <span className="font-mono text-muted-foreground text-xs">
                  {formatBytes(totalSize)} / {storageLimitDisplay} (
                  {usagePercent}%)
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-muted/50"
                role="img"
                aria-label={`Storage usage: ${formatBytes(totalSize)} of ${storageLimitDisplay} (${usagePercent}%)`}
              >
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${usagePercent < 80 ? 'bg-dynamic-blue' : usagePercent < 95 ? 'bg-dynamic-orange' : 'bg-dynamic-red'}`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
            </div>

            {/* Enhanced Statistics Dashboard */}
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              <div className="group relative overflow-hidden rounded-xl border border-dynamic-border bg-linear-to-br from-dynamic-blue/5 to-dynamic-blue/10 p-6 transition-all hover:shadow-dynamic-blue/10 hover:shadow-lg">
                <div className="absolute -top-4 -right-4 h-16 w-16 rounded-full bg-dynamic-blue/10 opacity-60 transition-transform group-hover:scale-110" />
                <div className="relative">
                  <h3 className="font-medium text-dynamic-blue text-sm">
                    {t('ws-storage-objects.total_files')}
                  </h3>
                  <div className="mt-2 font-bold text-3xl text-foreground">
                    {count}
                  </div>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {t('ws-storage-objects.files_in_workspace')}
                  </p>
                </div>
              </div>

              <div className="group relative overflow-hidden rounded-xl border border-dynamic-border bg-linear-to-br from-dynamic-green/5 to-dynamic-green/10 p-6 transition-all hover:shadow-dynamic-green/10 hover:shadow-lg">
                <div className="absolute -top-4 -right-4 h-16 w-16 rounded-full bg-dynamic-green/10 opacity-60 transition-transform group-hover:scale-110" />
                <div className="relative">
                  <h3 className="font-medium text-dynamic-green text-sm">
                    {t('ws-storage-objects.total_size')}
                  </h3>
                  <div className="mt-2 font-bold text-3xl text-foreground">
                    {formatBytes(totalSize)}
                  </div>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {t('ws-storage-objects.storage_used')}
                  </p>
                </div>
              </div>

              <div className="group relative overflow-hidden rounded-xl border border-dynamic-border bg-linear-to-br from-dynamic-purple/5 to-dynamic-purple/10 p-6 transition-all hover:shadow-dynamic-purple/10 hover:shadow-lg">
                <div className="absolute -top-4 -right-4 h-16 w-16 rounded-full bg-dynamic-purple/10 opacity-60 transition-transform group-hover:scale-110" />
                <div className="relative">
                  <h3 className="font-medium text-dynamic-purple text-sm">
                    {t('ws-storage-objects.largest_file')}
                  </h3>
                  <div className="mt-2 font-bold text-3xl text-foreground">
                    {largestFile?.size ? formatBytes(largestFile.size) : '-'}
                  </div>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {t('ws-storage-objects.max_file_size')}
                  </p>
                </div>
              </div>

              <div className="group relative overflow-hidden rounded-xl border border-dynamic-border bg-linear-to-br from-dynamic-orange/5 to-dynamic-orange/10 p-6 transition-all hover:shadow-dynamic-orange/10 hover:shadow-lg">
                <div className="absolute -top-4 -right-4 h-16 w-16 rounded-full bg-dynamic-orange/10 opacity-60 transition-transform group-hover:scale-110" />
                <div className="relative">
                  <h3 className="font-medium text-dynamic-orange text-sm">
                    {t('ws-storage-objects.smallest_file')}
                  </h3>
                  <div className="mt-2 font-bold text-3xl text-foreground">
                    {smallestFile?.size ? formatBytes(smallestFile.size) : '-'}
                  </div>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {t('ws-storage-objects.min_file_size')}
                  </p>
                </div>
              </div>
            </div>

            <StorageObjectsTable
              wsId={wsId}
              data={data.map((t) => ({
                ...t,
                ws_id: wsId,
              }))}
              path={path}
              count={count ?? 0}
            />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getData(
  wsId: string,
  { q, page = '1', pageSize = '10', path = '' }: Awaited<Props['searchParams']>
) {
  const supabase = await createDynamicClient();

  const { data, error } = await supabase.storage
    .from('workspaces')
    .list(joinPath(wsId, path), {
      limit: parseInt(pageSize, 10),
      offset: (parseInt(page, 10) - 1) * parseInt(pageSize, 10),
      sortBy: { column: 'created_at', order: 'desc' },
      search: `%${q ?? ''}%`,
    });

  if (error) {
    console.error('Error fetching storage objects:', error);
    throw error;
  }

  return {
    data: data.filter(
      (object) => !object.name.match(EMPTY_FOLDER_PLACEHOLDER_NAME)
    ),
  } as {
    data: StorageObject[];
  };
}

async function getTotalSize(wsId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_workspace_drive_size', {
    ws_id: wsId,
  });

  if (error) {
    console.error('Error fetching total size:', error);
    return 0;
  }
  return data ?? 0;
}

async function getFileCount(wsId: string) {
  const supabase = await createDynamicClient();

  const { count, error } = await supabase
    .schema('storage')
    .from('objects')
    .select('*', { count: 'exact', head: true })
    .eq('bucket_id', 'workspaces')
    .ilike('name', `${wsId}/%`)
    .not('name', 'ilike', `%${EMPTY_FOLDER_PLACEHOLDER_NAME}`);

  if (error) {
    console.error('Error fetching file count:', error);
    return 0;
  }
  return count ?? 0;
}

async function getLargestFile(wsId: string) {
  const supabase = await createDynamicClient();

  const { data, error } = await supabase
    .schema('storage')
    .from('objects')
    .select('metadata')
    .eq('bucket_id', 'workspaces')
    .ilike('name', `${wsId}/%`)
    .not('name', 'ilike', `%${EMPTY_FOLDER_PLACEHOLDER_NAME}`)
    .order('metadata->size', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching largest file:', error);
    return null;
  }
  return data?.metadata as { size: number } | null;
}

async function getSmallestFile(wsId: string) {
  const supabase = await createDynamicClient();

  const { data, error } = await supabase
    .schema('storage')
    .from('objects')
    .select('metadata')
    .eq('bucket_id', 'workspaces')
    .ilike('name', `${wsId}/%`)
    .not('name', 'ilike', `%${EMPTY_FOLDER_PLACEHOLDER_NAME}`)
    .order('metadata->size', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching smallest file:', error);
    return null;
  }
  return data?.metadata as { size: number } | null;
}

async function getStorageLimit(wsId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_workspace_storage_limit', {
    ws_id: wsId,
  });

  if (error) {
    console.error('Error fetching storage limit:', error);
    return 104857600; // 100MB default
  }
  return data ?? 104857600; // 100MB default
}
