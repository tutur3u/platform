import type { Json, Tables } from './supabase';

export type ExternalProjectAsset = Tables<'workspace_external_project_assets'>;

export type ExternalProjectDeliveryAsset = Pick<
  ExternalProjectAsset,
  | 'id'
  | 'entry_id'
  | 'block_id'
  | 'asset_type'
  | 'storage_path'
  | 'source_url'
  | 'alt_text'
  | 'sort_order'
  | 'updated_at'
> & {
  metadata: Json;
  assetUrl: string | null;
  assetRevision: string;
  published?: boolean;
};
