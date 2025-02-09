// same usage as Supabase Studio defined value
// see: https://github.com/supabase/supabase/blob/0ba764c13fb8205b0b531e78d70d40255cb71335/apps/studio/localStores/storageExplorer/StorageExplorerStore.tsx#L74
export const EMPTY_FOLDER_PLACEHOLDER_NAME = '.emptyFolderPlaceholder';

export interface StorageObject {
  id?: string;
  bucket_id?: string;
  name?: string;
  owner?: string;
  created_at?: string;
  updated_at?: string;
  last_accessed_at?: string;
  // metadata has eTag, size, mimeType, and other metadata
  metadata?: Record<string, any>;
  path_tokens?: string[];
  version?: string;
}
