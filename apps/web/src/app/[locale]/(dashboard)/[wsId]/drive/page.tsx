import NewActions from './new-actions';
import StorageObjectsTable from './table';
import { formatBytes } from '@/utils/file-helper';
import { joinPath } from '@/utils/path-helper';
import {
  createClient,
  createDynamicClient,
} from '@tuturuuu/supabase/next/server';
import {
  EMPTY_FOLDER_PLACEHOLDER_NAME,
  type StorageObject,
} from '@tuturuuu/types/primitives/StorageObject';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@tuturuuu/ui/breadcrumb';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Folder } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
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
  const { wsId: id } = await params;
  const t = await getTranslations();

  const workspace = await getWorkspace(id);
  const wsId = workspace.id;

  const { withoutPermission } = await getPermissions({
    wsId,
  });
  const { path } = await searchParams;

  if (withoutPermission('manage_drive')) redirect(`/${wsId}`);

  const { data } = await getData(wsId, await searchParams);

  const count = await getFileCount(wsId);
  const totalSize = await getTotalSize(wsId);
  const largestFile = await getLargestFile(wsId);
  const smallestFile = await getSmallestFile(wsId);

  // Dynamic Storage limit
  const isRootWorkspace = wsId === ROOT_WORKSPACE_ID;
  const STORAGE_LIMIT = isRootWorkspace
    ? 100 * 1024 * 1024 * 1024
    : 50 * 1024 * 1024; // 100GB or 50MB
  const usagePercent = Math.min(
    100,
    Math.round((totalSize / STORAGE_LIMIT) * 100)
  );
  const storageLimitDisplay = isRootWorkspace ? '100 GB' : '50 MB';

  // Build breadcrumb navigation
  const pathSegments = path ? path.split('/').filter(Boolean) : [];
  const breadcrumbItems = [
    {
      label: t('ws-storage-objects.name'),
      href: `/${wsId}/drive`,
      isRoot: true,
    },
    ...pathSegments.map((segment, index) => {
      const currentPath = pathSegments.slice(0, index + 1).join('/');
      return {
        label: decodeURIComponent(segment),
        href: `/${wsId}/drive?path=${currentPath}`,
        isRoot: false,
      };
    }),
  ];

  // Ellipsis logic: show first, last, and up to 2 in the middle; collapse the rest
  let visibleItems = breadcrumbItems;
  let collapsedItems: typeof breadcrumbItems = [];
  if (breadcrumbItems.length > 5) {
    visibleItems = [];
    if (breadcrumbItems[0]) visibleItems.push(breadcrumbItems[0]);
    if (breadcrumbItems[1]) visibleItems.push(breadcrumbItems[1]);
    visibleItems.push(...breadcrumbItems.slice(-3));
    collapsedItems = breadcrumbItems.slice(2, -3);
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <Breadcrumb>
        <BreadcrumbList className="flex items-center gap-1 overflow-x-auto whitespace-nowrap rounded-lg border border-dynamic-border bg-muted/40 px-1 py-2">
          {visibleItems.map((item, index) => (
            <div key={item.href} className="flex items-center">
              <BreadcrumbItem>
                {item.isRoot ? (
                  <BreadcrumbLink asChild>
                    <Link
                      href={item.href}
                      className="flex items-center gap-1 rounded px-2 py-1 font-semibold text-dynamic-blue transition-colors hover:text-dynamic-blue/80 focus:outline-none focus:ring-2 focus:ring-dynamic-blue/30"
                    >
                      <Folder className="mr-1 h-4 w-4 text-dynamic-blue/70" />
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                ) : index === visibleItems.length - 1 ? (
                  <BreadcrumbPage className="flex items-center gap-1 rounded px-2 py-1 font-semibold text-dynamic-blue">
                    <Folder className="mr-1 h-4 w-4 text-dynamic-blue/70" />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-block max-w-[120px] truncate align-middle">
                            {item.label}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{item.label}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link
                      href={item.href}
                      className="flex items-center gap-1 rounded px-2 py-1 transition-colors hover:text-dynamic-blue focus:outline-none focus:ring-2 focus:ring-dynamic-blue/30"
                    >
                      <Folder className="mr-1 h-4 w-4 text-dynamic-blue/70" />
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-block max-w-[120px] truncate align-middle">
                              {item.label}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{item.label}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {/* Ellipsis for collapsed items */}
              {index === 1 && collapsedItems.length > 0 && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="rounded px-2 py-1 text-muted-foreground hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-dynamic-blue/30"
                        >
                          …
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {collapsedItems.map((collapsed) => (
                          <DropdownMenuItem key={collapsed.href} asChild>
                            <Link
                              href={collapsed.href}
                              className="flex items-center gap-1"
                            >
                              <Folder className="mr-1 h-4 w-4 text-dynamic-blue/70" />
                              <span>{collapsed.label}</span>
                            </Link>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </BreadcrumbItem>
                </>
              )}
              {index < visibleItems.length - 1 && <BreadcrumbSeparator />}
            </div>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

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
            {formatBytes(totalSize)} / {storageLimitDisplay} ({usagePercent}%)
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
        <div className="group relative overflow-hidden rounded-xl border border-dynamic-border bg-gradient-to-br from-dynamic-blue/5 to-dynamic-blue/10 p-6 transition-all hover:shadow-dynamic-blue/10 hover:shadow-lg">
          <div className="-top-4 -right-4 absolute h-16 w-16 rounded-full bg-dynamic-blue/10 opacity-60 transition-transform group-hover:scale-110" />
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

        <div className="group relative overflow-hidden rounded-xl border border-dynamic-border bg-gradient-to-br from-dynamic-green/5 to-dynamic-green/10 p-6 transition-all hover:shadow-dynamic-green/10 hover:shadow-lg">
          <div className="-top-4 -right-4 absolute h-16 w-16 rounded-full bg-dynamic-green/10 opacity-60 transition-transform group-hover:scale-110" />
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

        <div className="group relative overflow-hidden rounded-xl border border-dynamic-border bg-gradient-to-br from-dynamic-purple/5 to-dynamic-purple/10 p-6 transition-all hover:shadow-dynamic-purple/10 hover:shadow-lg">
          <div className="-top-4 -right-4 absolute h-16 w-16 rounded-full bg-dynamic-purple/10 opacity-60 transition-transform group-hover:scale-110" />
          <div className="relative">
            <h3 className="font-medium text-dynamic-purple text-sm">
              {t('ws-storage-objects.largest_file')}
            </h3>
            <div className="mt-2 font-bold text-3xl text-foreground">
              {data.length > 0 ? formatBytes(largestFile?.size as number) : '-'}
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              {t('ws-storage-objects.max_file_size')}
            </p>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-xl border border-dynamic-border bg-gradient-to-br from-dynamic-orange/5 to-dynamic-orange/10 p-6 transition-all hover:shadow-dynamic-orange/10 hover:shadow-lg">
          <div className="-top-4 -right-4 absolute h-16 w-16 rounded-full bg-dynamic-orange/10 opacity-60 transition-transform group-hover:scale-110" />
          <div className="relative">
            <h3 className="font-medium text-dynamic-orange text-sm">
              {t('ws-storage-objects.smallest_file')}
            </h3>
            <div className="mt-2 font-bold text-3xl text-foreground">
              {data.length > 0
                ? formatBytes(smallestFile?.size as number)
                : '-'}
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
    </div>
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
