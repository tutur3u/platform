import StorageObjectsTable from './table';
import { getPermissions, verifyHasSecrets } from '@/lib/workspace-helper';
import {
  EMPTY_FOLDER_PLACEHOLDER_NAME,
  StorageObject,
} from '@/types/primitives/StorageObject';
import { formatBytes } from '@/utils/file-helper';
import { createClient, createDynamicClient } from '@/utils/supabase/server';
import { Separator } from '@repo/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
    path: string;
  }>;
}

export default async function WorkspaceStorageObjectsPage({
  params,
  searchParams,
}: Props) {
  const { wsId } = await params;
  const t = await getTranslations('ws-storage-objects');

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_drive')) redirect(`/${wsId}`);

  await verifyHasSecrets(wsId, ['ENABLE_DRIVE'], `/${wsId}`);
  const { data } = await getData(wsId, await searchParams);

  const count = await getFileCount(wsId);
  const totalSize = await getTotalSize(wsId);
  const largestFile = await getLargestFile(wsId);
  const smallestFile = await getSmallestFile(wsId);

  return (
    <>
      <div className="border-border bg-foreground/5 flex flex-col justify-between gap-4 rounded-lg border p-4 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-bold">{t('module')}</h1>
          <p className="text-foreground/80">{t('description')}</p>
        </div>
      </div>

      <div className="mb-8 mt-4 grid gap-4 text-center md:grid-cols-2 xl:grid-cols-4">
        <div className="border-border bg-foreground/5 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">{t('total_files')}</h2>
          <Separator className="my-2" />
          <div className="text-3xl font-bold">{count}</div>
        </div>

        <div className="border-border bg-foreground/5 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">{t('total_size')}</h2>
          <Separator className="my-2" />
          <div className="text-3xl font-bold">{formatBytes(totalSize)}</div>
        </div>

        <div className="border-border bg-foreground/5 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">{t('largest_file')}</h2>
          <Separator className="my-2" />
          <div className="text-3xl font-bold">
            {data.length > 0 ? formatBytes(largestFile?.size as number) : '-'}
          </div>
        </div>

        <div className="border-border bg-foreground/5 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">{t('smallest_file')}</h2>
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
        count={count ?? 0}
      />
    </>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    // with trailing slash
    path = '',
  }: { q?: string; page?: string; pageSize?: string; path?: string }
) {
  const supabase = await createDynamicClient();

  const { data, error } = await supabase.storage
    .from('workspaces')
    .list(`${wsId}/${path}`, {
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
