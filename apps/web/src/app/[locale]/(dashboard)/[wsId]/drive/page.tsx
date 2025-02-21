import NewActions from './new-actions';
import StorageObjectsTable from './table';
import { getPermissions, verifyHasSecrets } from '@/lib/workspace-helper';
import { formatBytes } from '@/utils/file-helper';
import { joinPath } from '@/utils/path-helper';
import {
  createClient,
  createDynamicClient,
} from '@tutur3u/supabase/next/server';
import {
  EMPTY_FOLDER_PLACEHOLDER_NAME,
  StorageObject,
} from '@tutur3u/types/primitives/StorageObject';
import FeatureSummary from '@tutur3u/ui/custom/feature-summary';
import { Separator } from '@tutur3u/ui/separator';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

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
  const { wsId } = await params;
  const t = await getTranslations();

  const { withoutPermission } = await getPermissions({
    wsId,
  });
  const { path } = await searchParams;

  if (withoutPermission('manage_drive')) redirect(`/${wsId}`);

  await verifyHasSecrets(wsId, ['ENABLE_DRIVE'], `/${wsId}`);
  const { data } = await getData(wsId, await searchParams);

  const count = await getFileCount(wsId);
  const totalSize = await getTotalSize(wsId);
  const largestFile = await getLargestFile(wsId);
  const smallestFile = await getSmallestFile(wsId);

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-storage-objects.plural')}
        singularTitle={t('ws-storage-objects.singular')}
        description={t('ws-storage-objects.description')}
        createTitle={t('ws-storage-objects.upload')}
        createDescription={t('ws-storage-objects.upload_description')}
        action={<NewActions wsId={wsId} path={path} />}
      />
      <Separator className="my-4" />

      <div className="mb-4 grid gap-4 text-center md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border bg-foreground/5 p-4">
          <h2 className="text-lg font-semibold">
            {t('ws-storage-objects.total_files')}
          </h2>
          <Separator className="my-2" />
          <div className="text-3xl font-bold">{count}</div>
        </div>

        <div className="rounded-lg border border-border bg-foreground/5 p-4">
          <h2 className="text-lg font-semibold">
            {t('ws-storage-objects.total_size')}
          </h2>
          <Separator className="my-2" />
          <div className="text-3xl font-bold">{formatBytes(totalSize)}</div>
        </div>

        <div className="rounded-lg border border-border bg-foreground/5 p-4">
          <h2 className="text-lg font-semibold">
            {t('ws-storage-objects.largest_file')}
          </h2>
          <Separator className="my-2" />
          <div className="text-3xl font-bold">
            {data.length > 0 ? formatBytes(largestFile?.size as number) : '-'}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-foreground/5 p-4">
          <h2 className="text-lg font-semibold">
            {t('ws-storage-objects.smallest_file')}
          </h2>
          <Separator className="my-2" />
          <div className="text-3xl font-bold">
            {data.length > 0 ? formatBytes(smallestFile?.size as number) : '-'}
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
}

async function getData(
  wsId: string,
  { q, page = '1', pageSize = '10', path = '' }: Awaited<Props['searchParams']>
) {
  const supabase = await createDynamicClient();

  const { data, error } = await supabase.storage
    .from('workspaces')
    .list(joinPath(wsId, path), {
      limit: parseInt(pageSize),
      offset: (parseInt(page) - 1) * parseInt(pageSize),
      sortBy: { column: 'created_at', order: 'desc' },
      search: `%${q ?? ''}%`,
    });
  if (error) throw error;

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

  if (error) throw error;
  return data;
}

async function getFileCount(wsId: string) {
  const supabase = await createDynamicClient();

  const { count, error } = await supabase
    .schema('storage')
    .from('objects')
    .select('*', { count: 'exact', head: true })
    .eq('bucket_id', 'workspaces')
    .not('owner', 'is', null)
    .ilike('name', `${wsId}/%`)
    .not('name', 'ilike', `%${EMPTY_FOLDER_PLACEHOLDER_NAME}`);

  if (error) throw error;
  return count;
}

async function getLargestFile(wsId: string) {
  const supabase = await createDynamicClient();

  const { data, error } = await supabase
    .schema('storage')
    .from('objects')
    .select('metadata->size')
    .eq('bucket_id', 'workspaces')
    .not('owner', 'is', null)
    .ilike('name', `${wsId}/%`)
    .order('metadata->size', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getSmallestFile(wsId: string) {
  const supabase = await createDynamicClient();

  const { data, error } = await supabase
    .schema('storage')
    .from('objects')
    .select('metadata->size')
    .eq('bucket_id', 'workspaces')
    .not('owner', 'is', null)
    .ilike('name', `${wsId}/%`)
    .order('metadata->size', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}
