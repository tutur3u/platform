import { getCameraColumns } from './columns';
import ExportDialogContent from './export-dialog-content';
import Filters from './filters';
import CameraForm from './form';
import ImportDialogContent from './import-dialog-content';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceCamera } from '@tuturuuu/types/primitives/WorkspaceCamera';
import type { WorkspaceCameraField } from '@tuturuuu/types/primitives/WorkspaceCameraField';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  includedGroups?: string | string[];
  excludedGroups?: string | string[];
}

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function WorkspaceCamerasPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { locale, wsId } = await params;

  const { data, count } = await getData(wsId, await searchParams);
  const { data: extraFields } = await getCameraFields(wsId);

  const { containsPermission } = await getPermissions({
    wsId,
  });

  const cameras = data.map((c) => ({
    ...c,
    href: `/${wsId}/users/camera/${c.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-cameras.plural')}
        singularTitle={t('ws-cameras.singular')}
        description={t('ws-cameras.description')}
        createTitle={t('ws-cameras.create')}
        createDescription={t('ws-cameras.create_description')}
        form={<CameraForm wsId={wsId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={cameras}
        namespace="camera-data-table"
        columnGenerator={getCameraColumns}
        extraColumns={extraFields}
        extraData={{ locale, wsId }}
        count={count}
        filters={<Filters wsId={wsId} searchParams={await searchParams} />}
        toolbarImportContent={
          containsPermission('export_cameras_data') && (
            <ImportDialogContent wsId={wsId} />
          )
        }
        toolbarExportContent={
          containsPermission('export_cameras_data') && (
            <ExportDialogContent
              wsId={wsId}
              exportType="cameras"
              searchParams={await searchParams}
            />
          )
        }
        defaultVisibility={{
          id: false,
          status: false,
          location: false,
          model: false,
          ip_address: false,
          resolution: false,
          fps: false,
          storage_path: false,
          note: false,
          created_at: false,
          updated_at: false,

          // Extra columns
          ...Object.fromEntries(extraFields.map((field) => [field.id, false])),
        }}
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
    includedGroups = [],
    excludedGroups = [],
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .rpc(
      'get_workspace_cameras',
      {
        _ws_id: wsId,
        included_groups: Array.isArray(includedGroups)
          ? includedGroups
          : [includedGroups],
        excluded_groups: Array.isArray(excludedGroups)
          ? excludedGroups
          : [excludedGroups],
        search_query: q || '',
      },
      {
        count: 'exact',
      }
    )
    .select('*')
    .order('name', { ascending: true, nullsFirst: false });

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;

  if (error) {
    if (!retry) throw error;
    return getData(wsId, { q, pageSize, retry: false });
  }

  return { data, count } as unknown as {
    data: WorkspaceCamera[];
    count: number;
  };
}

async function getCameraFields(wsId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_camera_fields')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  const { data, error, count } = await queryBuilder;

  if (error) throw error;

  return { data, count } as { data: WorkspaceCameraField[]; count: number };
}
