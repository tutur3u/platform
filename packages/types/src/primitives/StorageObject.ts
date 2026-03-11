// same usage as Supabase Studio defined value
// see: https://github.com/supabase/supabase/blob/0ba764c13fb8205b0b531e78d70d40255cb71335/apps/studio/localStores/storageExplorer/StorageExplorerStore.tsx#L74
export const EMPTY_FOLDER_PLACEHOLDER_NAME = '.emptyFolderPlaceholder';

export interface StorageObject {
  id?: string | null;
  bucket_id?: string | null;
  name?: string;
  owner?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_accessed_at?: string | null;
  // metadata has eTag, size, mimeType, and other metadata
  metadata?: Record<string, any> | null;
  path_tokens?: string[];
  version?: string | null;
}
