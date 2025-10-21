/**
 * API Key Management Utilities
 *
 * Provides secure generation, hashing, and validation of workspace API keys
 * for external SDK authentication. Uses workspace role-based permissions.
 */

import { createClient } from '@tuturuuu/supabase/next/server';
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
 * // key: "ttr_1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7a8b9c0d1e2f3g4h"
 * // prefix: "ttr_1a2b"
 */
export function generateApiKey(): { key: string; prefix: string } {
  const randomBuffer = randomBytes(KEY_LENGTH);
  const keyBody = randomBuffer.toString('hex');
  const key = `${KEY_PREFIX}${keyBody}`;
  const prefix = key.substring(0, 12); // "ttr_" + first 8 chars

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
  } catch (error) {
    console.error('Error validating API key:', error);
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
  permissions: string[]; // List of workspace_role_permission values
}

/**
 * Validates an API key and returns the workspace context with permissions
 * Also updates the last_used_at timestamp
 *
 * @param apiKey - The raw API key from the Authorization header
 * @returns WorkspaceContext if valid, null if invalid or expired
 */
export async function validateApiKey(
  apiKey: string
): Promise<WorkspaceContext | null> {
  try {
    // Validate key format
    if (!apiKey.startsWith(KEY_PREFIX)) {
      return null;
    }

    const supabase = await createClient();

    // Get all API keys and validate against each hash
    // We can't query by hash directly since we need to compare with scrypt
    const { data: keys, error } = await supabase
      .from('workspace_api_keys')
      .select('id, ws_id, key_hash, role_id, expires_at')
      .is('expires_at', null)
      .or(`expires_at.gt.${new Date().toISOString()}`);

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
        const permissions: string[] = [];

        if (keyRecord.role_id) {
          const { data: rolePermissions } = await supabase
            .from('workspace_role_permissions')
            .select('permission')
            .eq('ws_id', keyRecord.ws_id)
            .eq('role_id', keyRecord.role_id)
            .eq('enabled', true);

          if (rolePermissions) {
            permissions.push(...rolePermissions.map((p) => p.permission));
          }
        }

        // Update last_used_at timestamp (fire and forget)
        supabase
          .from('workspace_api_keys')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', keyRecord.id)
          .then();

        return {
          wsId: keyRecord.ws_id,
          keyId: keyRecord.id,
          roleId: keyRecord.role_id,
          permissions,
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error validating API key:', error);
    return null;
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
  permission: string
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
  requiredPermissions: string[]
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
  requiredPermissions: string[]
): boolean {
  return requiredPermissions.every((perm) => hasPermission(context, perm));
}
