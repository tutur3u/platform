import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  ExternalProjectAsset,
  ExternalProjectStudioAsset,
} from '@tuturuuu/types';
import { buildDeliveryAssetUrl, EPM_IMAGE_PREVIEW_TRANSFORM } from './store';

type AdminDb = TypedSupabaseClient;

export type WorkspaceExternalProjectMediaType =
  | 'all'
  | 'image'
  | 'audio'
  | 'other';

export type WorkspaceExternalProjectMediaAttachment =
  | 'all'
  | 'attached'
  | 'unattached';

export type WorkspaceExternalProjectMediaItem = ExternalProjectStudioAsset & {
  entry: { id: string; title: string } | null;
};

export type WorkspaceExternalProjectMediaPage = {
  items: WorkspaceExternalProjectMediaItem[];
  pageInfo: {
    hasMore: boolean;
    nextPage: number | null;
    page: number;
    pageSize: number;
    total: number;
  };
  totals: Record<WorkspaceExternalProjectMediaType, number>;
};

export type ListWorkspaceExternalProjectMediaInput = {
  attachment: WorkspaceExternalProjectMediaAttachment;
  page: number;
  pageSize: number;
  query: string;
  type: WorkspaceExternalProjectMediaType;
};

function getSearchPattern(query: string) {
  return query
    .trim()
    .replace(/[\\%_]/g, '\\$&')
    .replace(/[(),]/g, ' ');
}

function getSearchFilter(query: string) {
  const searchPattern = getSearchPattern(query);
  if (!searchPattern) return null;

  const pattern = `%${searchPattern}%`;
  return [
    `alt_text.ilike.${pattern}`,
    `asset_type.ilike.${pattern}`,
    `source_url.ilike.${pattern}`,
    `storage_path.ilike.${pattern}`,
  ].join(',');
}

function toStudioAsset(
  workspaceId: string,
  asset: ExternalProjectAsset
): ExternalProjectStudioAsset {
  const assetUrl = buildDeliveryAssetUrl(workspaceId, asset);
  return {
    ...asset,
    asset_url: assetUrl,
    preview_url:
      asset.asset_type === 'image'
        ? buildDeliveryAssetUrl(workspaceId, asset, {
            transform: EPM_IMAGE_PREVIEW_TRANSFORM,
          })
        : assetUrl,
  };
}

export async function listWorkspaceExternalProjectMediaPage(
  workspaceId: string,
  input: ListWorkspaceExternalProjectMediaInput,
  db: AdminDb
): Promise<WorkspaceExternalProjectMediaPage> {
  const from = (input.page - 1) * input.pageSize;
  const to = from + input.pageSize - 1;

  const countType = async (type: WorkspaceExternalProjectMediaType) => {
    let query = db
      .from('workspace_external_project_assets')
      .select('id', { count: 'exact', head: true })
      .eq('ws_id', workspaceId);
    if (type === 'image' || type === 'audio') {
      query = query.eq('asset_type', type);
    } else if (type === 'other') {
      query = query
        .not('asset_type', 'eq', 'image')
        .not('asset_type', 'eq', 'audio');
    }
    if (input.attachment === 'attached') {
      query = query.not('entry_id', 'is', null);
    } else if (input.attachment === 'unattached') {
      query = query.is('entry_id', null);
    }
    const searchFilter = getSearchFilter(input.query);
    if (searchFilter) query = query.or(searchFilter);

    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  let pageQuery = db
    .from('workspace_external_project_assets')
    .select(
      '*, entry:workspace_external_project_entries!workspace_external_project_assets_entry_id_fkey(id, title)',
      { count: 'exact' }
    )
    .eq('ws_id', workspaceId);
  if (input.type === 'image' || input.type === 'audio') {
    pageQuery = pageQuery.eq('asset_type', input.type);
  } else if (input.type === 'other') {
    pageQuery = pageQuery
      .not('asset_type', 'eq', 'image')
      .not('asset_type', 'eq', 'audio');
  }
  if (input.attachment === 'attached') {
    pageQuery = pageQuery.not('entry_id', 'is', null);
  } else if (input.attachment === 'unattached') {
    pageQuery = pageQuery.is('entry_id', null);
  }
  const searchFilter = getSearchFilter(input.query);
  if (searchFilter) pageQuery = pageQuery.or(searchFilter);
  pageQuery = pageQuery
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);

  const types: WorkspaceExternalProjectMediaType[] = [
    'all',
    'image',
    'audio',
    'other',
  ];
  const [pageResult, ...countResults] = await Promise.all([
    pageQuery,
    ...types.map((type) => countType(type)),
  ]);

  if (pageResult.error) {
    throw new Error(pageResult.error.message);
  }

  const total = pageResult.count ?? 0;
  const items = (pageResult.data ?? []).map((row) => {
    const { entry, ...asset } = row;
    return {
      ...toStudioAsset(workspaceId, asset),
      entry,
    } satisfies WorkspaceExternalProjectMediaItem;
  });

  return {
    items,
    pageInfo: {
      hasMore: from + items.length < total,
      nextPage: from + items.length < total ? input.page + 1 : null,
      page: input.page,
      pageSize: input.pageSize,
      total,
    },
    totals: Object.fromEntries(
      types.map((type, index) => [type, countResults[index] ?? 0])
    ) as Record<WorkspaceExternalProjectMediaType, number>,
  };
}
