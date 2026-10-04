import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Tables } from '@tuturuuu/types';
import { EXOCORPSE_WORKSPACE_ID, exocorpseWikiCollections } from './lettin.js';
/** Caller must verify staff email and source workspace permission before invoking. */
export async function readExocorpseWikiSource() {
  const admin = await createAdminClient({ noCookie: true });
  const { data: collections, error: collectionError } = await admin
    .from('workspace_external_project_collections')
    .select('id,slug')
    .eq('ws_id', EXOCORPSE_WORKSPACE_ID)
    .in('slug', exocorpseWikiCollections);
  if (collectionError) throw new Error('Exocorpse source unavailable');
  const slugs = new Map((collections ?? []).map((row) => [row.id, row.slug]));
  if (!slugs.size) throw new Error('No Exocorpse wiki collections');
  const entries = [];
  for (let offset = 0; offset < 1000; offset += 200) {
    const { data, error } = await admin
      .from('workspace_external_project_entries')
      .select(
        'id,collection_id,title,slug,summary,profile_data,metadata,stable_source_id'
      )
      .eq('ws_id', EXOCORPSE_WORKSPACE_ID)
      .in('collection_id', [...slugs.keys()])
      .order('id')
      .range(offset, offset + 199);
    if (error) throw new Error('Exocorpse entries unavailable');
    entries.push(...(data ?? []));
    if (!data || data.length < 200) break;
    if (offset === 800)
      throw new Error('Exocorpse import exceeds 1000 records');
  }
  const ids = entries.map((entry) => entry.id);
  const blocks: Pick<
    Tables<'workspace_external_project_blocks'>,
    'entry_id' | 'block_type' | 'content' | 'title' | 'sort_order'
  >[] = [];
  const assets: Pick<
    Tables<'workspace_external_project_assets'>,
    | 'id'
    | 'entry_id'
    | 'asset_type'
    | 'source_url'
    | 'storage_path'
    | 'alt_text'
    | 'metadata'
    | 'sort_order'
  >[] = [];
  const relations: Pick<
    Tables<'workspace_external_project_entry_relations'>,
    'from_entry_id' | 'to_entry_id' | 'relation_type' | 'metadata'
  >[] = [];
  // Keep PostgREST URLs and response pages bounded.
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    const responses = await Promise.all([
      admin
        .from('workspace_external_project_blocks')
        .select('entry_id,block_type,content,title,sort_order')
        .eq('ws_id', EXOCORPSE_WORKSPACE_ID)
        .in('entry_id', batch)
        .order('sort_order')
        .limit(1000),
      admin
        .from('workspace_external_project_assets')
        .select(
          'id,entry_id,asset_type,source_url,storage_path,alt_text,metadata,sort_order'
        )
        .eq('ws_id', EXOCORPSE_WORKSPACE_ID)
        .in('entry_id', batch)
        .order('sort_order')
        .limit(1000),
      admin
        .from('workspace_external_project_entry_relations')
        .select('from_entry_id,to_entry_id,relation_type,metadata')
        .eq('ws_id', EXOCORPSE_WORKSPACE_ID)
        .in('from_entry_id', batch)
        .order('id')
        .limit(1000),
    ]);
    if (
      responses.some((result) => result.error || result.data?.length === 1000)
    )
      throw new Error('Exocorpse source incomplete');
    blocks.push(...(responses[0].data ?? []));
    assets.push(...(responses[1].data ?? []));
    relations.push(...(responses[2].data ?? []));
  }
  return {
    adapter: 'exocorpse',
    content: {
      entries: entries.map((entry) => ({
        id: entry.id,
        stableSourceId: entry.stable_source_id ?? entry.id,
        collectionSlug: slugs.get(entry.collection_id),
        title: entry.title,
        slug: entry.slug,
        summary: entry.summary,
        profileData: entry.profile_data,
        metadata: entry.metadata,
        blocks: blocks
          .filter((block) => block.entry_id === entry.id)
          .map((block) => ({
            blockType: block.block_type,
            content: block.content,
            title: block.title,
          })),
        assets: assets
          .filter((asset) => asset.entry_id === entry.id)
          .map((asset) => ({
            assetType: asset.asset_type,
            sourceUrl: asset.storage_path
              ? `https://tuturuuu.com/api/v1/workspaces/${EXOCORPSE_WORKSPACE_ID}/external-projects/assets/${asset.id}`
              : asset.source_url,
            altText: asset.alt_text,
          })),
        relations: relations
          .filter((relation) => relation.from_entry_id === entry.id)
          .map((relation) => ({
            targetEntryId: relation.to_entry_id,
            definitionKey: relation.relation_type,
            metadata: relation.metadata,
          })),
      })),
    },
  };
}

/** Fixed source workspace only; caller must authorize the staff importer first. */
export async function readExocorpseAssetPath(assetId: string) {
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await admin
    .from('workspace_external_project_assets')
    .select('storage_path,metadata')
    .eq('ws_id', EXOCORPSE_WORKSPACE_ID)
    .eq('id', assetId)
    .maybeSingle();
  if (error || !data?.storage_path)
    throw new Error('Exocorpse artwork unavailable');
  return data;
}
