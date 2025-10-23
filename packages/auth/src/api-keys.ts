/**
 * API Key Management Utilities
 *
 * Provides secure generation, hashing, and validation of workspace API keys
 * for external SDK authentication. Uses workspace role-based permissions.
 */

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { PermissionId } from '@tuturuuu/types/db';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// API key configuration
const KEY_PREFIX = 'ttr_';
const KEY_LENGTH = 32; // 32 bytes = 64 hex characters
const SALT_LENGTH = 16;
const KEY_DERIVATION_LENGTH = 64;

/**
 * Generates a new API key with prefix
 * @returns Object containing the raw key and its prefix for display
 * @example
 * const { key, prefix } = generateApiKey();
 * // key: "ttr_<64-hex-chars>"
 * // prefix: "ttr_<8-hex>"
 */
export function generateApiKey(): { key: string; prefix: string } {
  const randomBuffer = randomBytes(KEY_LENGTH);
  const keyBody = randomBuffer.toString('hex');
  const key = `${KEY_PREFIX}${keyBody}`;
  const prefix = key.substring(0, 12); // "ttr_" (4 chars) + first 8 hex chars = 12 total

  return { key, prefix };
}

/**
 * Hashes an API key for secure storage
 * Uses scrypt with a random salt for secure key derivation
 *
 * @param key - The raw API key to hash
 * @returns The hashed key in the format: salt:hash
 */
export async function hashApiKey(key: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const derivedKey = (await scryptAsync(
    key,
    salt,
    KEY_DERIVATION_LENGTH
  )) as Buffer;

  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Validates an API key against its stored hash
 * Uses constant-time comparison to prevent timing attacks
 *
 * @param key - The raw API key to validate
 * @param storedHash - The stored hash in format: salt:hash
 * @returns True if the key is valid
 */
export async function validateApiKeyHash(
  key: string,
  storedHash: string
): Promise<boolean> {
  try {
    const [salt, hash] = storedHash.split(':');

    if (!salt || !hash) {
      return false;
    }

    const derivedKey = (await scryptAsync(
      key,
      salt,
      KEY_DERIVATION_LENGTH
    )) as Buffer;

    const storedHashBuffer = Buffer.from(hash, 'hex');

    // Use timing-safe comparison to prevent timing attacks
    return timingSafeEqual(derivedKey, storedHashBuffer);
  } catch (_) {
    // Silently fail - do not log crypto errors as they may contain sensitive information
    // The caller will receive false and can handle accordingly
    return false;
  }
}

/**
 * Workspace context returned after successful API key validation
 */
export interface WorkspaceContext {
  wsId: string;
  keyId: string;
  roleId: string | null;
  permissions: PermissionId[];
}

/**
 * Validates an API key and returns the workspace context with permissions
 * Also updates the last_used_at timestamp
 *
 * @param apiKey - The raw API key from the Authorization header
 * @returns WorkspaceContext if valid, null if invalid or expired
 *
 * @remarks
 * This function uses an admin client to bypass RLS policies.
 * Requires a unique index on key_prefix for optimal performance:
 * CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_api_keys_key_prefix ON workspace_api_keys(key_prefix);
 */
export async function validateApiKey(
  apiKey: string
): Promise<WorkspaceContext | null> {
  try {
    // Validate key format
    if (!apiKey.startsWith(KEY_PREFIX)) {
      return null;
    }

    // Extract key_prefix for efficient lookup (first 12 characters)
    const keyPrefix = apiKey.substring(0, 12);

    const supabase = await createAdminClient();

    // Query by key_prefix to fetch only the candidate row
    // This assumes a unique index exists on key_prefix for single-row matches
    const { data: keys, error } = await supabase
      .from('workspace_api_keys')
      .select('id, ws_id, key_hash, role_id, expires_at')
      .eq('key_prefix', keyPrefix)
      .or('expires_at.is.null,expires_at.gt.now()');

    if (error || !keys || keys.length === 0) {
      return null;
    }

    // Find matching key by validating hash
    for (const keyRecord of keys) {
      // Skip keys without a hash (legacy keys during migration)
      if (!keyRecord.key_hash) {
        continue;
      }

      const isValid = await validateApiKeyHash(apiKey, keyRecord.key_hash);

      if (isValid) {
        // Check if key is expired
        if (
          keyRecord.expires_at &&
          new Date(keyRecord.expires_at) < new Date()
        ) {
          return null;
        }

        // Get permissions for this role
        const permissions: PermissionId[] = [];

        if (keyRecord.role_id) {
          const { data: rolePermissions } = await supabase
            .from('workspace_role_permissions')
            .select('permission')
            .eq('ws_id', keyRecord.ws_id)
            .eq('role_id', keyRecord.role_id)
            .eq('enabled', true);

          if (rolePermissions) {
            permissions.push(
              ...(rolePermissions.map((p) => p.permission) as PermissionId[])
            );
          }
        }

        // Note: last_used_at is now derived from workspace_api_key_usage_logs
        // No need to update it separately since we're already logging every request

        return {
          wsId: keyRecord.ws_id,
          keyId: keyRecord.id,
          roleId: keyRecord.role_id,
          permissions,
        };
      }
    }

    return null;
  } catch (_) {
    // Silently fail - do not log validation errors as they may contain sensitive information
    // The caller will receive null and can handle accordingly
    return null;
  }
}

/**
 * Logs API key usage for detailed tracking and analytics
 *
 * @param params - Usage log parameters
 * @returns Promise that resolves when the log is inserted (fire-and-forget)
 *
 * @remarks
 * This function intentionally does not await or throw errors.
 * Logging failures should not impact the API request flow.
 */
export async function logApiKeyUsage(params: {
  apiKeyId: string;
  wsId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  ipAddress?: string | null;
  userAgent?: string | null;
  responseTimeMs?: number | null;
  requestParams?: Record<string, unknown> | null;
  errorMessage?: string | null;
}): Promise<void> {
  try {
    const supabase = await createAdminClient();

    // Insert the usage log - fire-and-forget with proper execution
    // Call .then() to actually execute the query without blocking
    supabase
      .from('workspace_api_key_usage_logs')
      .insert({
        api_key_id: params.apiKeyId,
        ws_id: params.wsId,
        endpoint: params.endpoint,
        method: params.method,
        status_code: params.statusCode,
        ip_address: params.ipAddress || null,
        user_agent: params.userAgent || null,
        response_time_ms: params.responseTimeMs || null,
        request_params: (params.requestParams || null) as never,
        error_message: params.errorMessage || null,
      })
      .then(
        () => {}, // Success - do nothing
        () => {} // Error - silently ignore
      );
  } catch {
    // Silently fail - logging should never break the API request
  }
}

/**
 * Checks if the workspace context has a specific permission
 *
 * @param context - The workspace context from validateApiKey
 * @param permission - The permission to check
 * @returns True if the permission is granted
 */
export function hasPermission(
  context: WorkspaceContext,
  permission: PermissionId
): boolean {
  return context.permissions.includes(permission);
}

/**
 * Checks if the workspace context has any of the specified permissions
 *
 * @param context - The workspace context from validateApiKey
 * @param requiredPermissions - Array of permissions to check (OR logic)
 * @returns True if any of the permissions are granted
 */
export function hasAnyPermission(
  context: WorkspaceContext,
  requiredPermissions: PermissionId[]
): boolean {
  return requiredPermissions.some((perm) => hasPermission(context, perm));
}

/**
 * Checks if the workspace context has all of the specified permissions
 *
 * @param context - The workspace context from validateApiKey
 * @param requiredPermissions - Array of permissions to check (AND logic)
 * @returns True if all permissions are granted
 */
export function hasAllPermissions(
  context: WorkspaceContext,
  requiredPermissions: PermissionId[]
): boolean {
  return requiredPermissions.every((perm) => hasPermission(context, perm));
}
