import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';

/**
 * Re-export Supabase's User type for backward compatibility.
 * Uses the canonical Supabase type to avoid schema drift.
 */
export type AuthUser = SupabaseUser;

/**
 * Result type for the checkE2EEPermission function
 */
export type CheckE2EEResult =
  | { authorized: true; user: AuthUser; reason?: undefined }
  | { authorized: false; user: null; reason?: undefined }
  | {
      authorized: false;
      user: AuthUser;
      reason: 'not_a_member' | 'no_permission';
    };

/**
 * Check if the current user has the manage_e2ee permission for a workspace.
 *
 * This checks:
 * 1. If the user is the creator of the workspace (has all permissions)
 * 2. If the user has manage_e2ee permission via their assigned roles
 * 3. If the user has manage_e2ee via workspace default permissions
 *
 * @param supabase - The Supabase client
 * @param wsId - The workspace ID to check permissions for
 * @returns An object with authorized status and the user
 */
export async function checkE2EEPermission(
  supabase: TypedSupabaseClient,
  wsId: string
): Promise<CheckE2EEResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { authorized: false, user: null };
  }

  // Check if user is a member of this workspace
  const { data: member } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!member) {
    return { authorized: false, user, reason: 'not_a_member' };
  }

  // Check if user is the creator of the workspace (has all permissions)
  const { data: workspaceData } = await supabase
    .from('workspaces')
    .select('creator_id')
    .eq('id', wsId)
    .single();

  if (workspaceData?.creator_id === user.id) {
    return { authorized: true, user };
  }

  // Check if user has manage_e2ee permission via roles
  // Use .limit(1) before .maybeSingle() because a user can belong to multiple roles
  // that all have manage_e2ee enabled; we only need to verify at least one exists
  const { data: rolePermission } = await supabase
    .from('workspace_role_members')
    .select(
      'workspace_roles!inner(workspace_role_permissions!inner(permission))'
    )
    .eq('user_id', user.id)
    .eq('workspace_roles.ws_id', wsId)
    .eq('workspace_roles.workspace_role_permissions.permission', 'manage_e2ee')
    .eq('workspace_roles.workspace_role_permissions.enabled', true)
    .limit(1)
    .maybeSingle();

  if (rolePermission) {
    return { authorized: true, user };
  }

  // Check if user has manage_e2ee via default permissions
  const { data: defaultPermission } = await supabase
    .from('workspace_default_permissions')
    .select('permission')
    .eq('ws_id', wsId)
    .eq('permission', 'manage_e2ee')
    .eq('enabled', true)
    .maybeSingle();

  if (defaultPermission) {
    return { authorized: true, user };
  }

  return { authorized: false, user, reason: 'no_permission' };
}

/**
 * Check if a string looks like encrypted data (AES-256-GCM format).
 *
 * Encrypted format is: iv (12 bytes) + ciphertext + authTag (16 bytes) = minimum 28 bytes
 * Base64 encoding of 28+ bytes = at least 40 characters of pure base64
 * Also, encrypted data won't have typical plaintext patterns like spaces
 *
 * IMPORTANT: Empty strings are valid encrypted values because the encryption service
 * intentionally preserves empty strings without encryption (see encryptField in
 * packages/utils/src/encryption/encryption-service.ts lines 162-164).
 * Therefore, empty strings should return true to avoid false positive "integrity_issue" warnings.
 *
 * @param value - The string to check
 * @returns true if the string appears to be encrypted (or is an empty string which is valid)
 */
export function looksLikeEncryptedData(
  value: string | null | undefined
): boolean {
  // null/undefined values are not valid encrypted data
  if (value === null || value === undefined) {
    return false;
  }

  // Empty strings are valid - the encryption service preserves them without encryption
  // An event with is_encrypted=true and empty title is legitimate
  if (value === '') {
    return true;
  }

  // Minimum length check: 28 bytes base64 encoded = ~40 characters
  if (value.length < 40) {
    return false;
  }

  // Must be valid base64 characters only (no spaces or other characters)
  if (!/^[A-Za-z0-9+/]+=*$/.test(value)) {
    return false;
  }

  return true;
}
