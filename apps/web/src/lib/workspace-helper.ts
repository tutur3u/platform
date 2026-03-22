import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import {
  PERSONAL_WORKSPACE_SLUG,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import {
  getWorkspace,
  getWorkspaceConfig as getWorkspaceConfigUtil,
  isPersonalWorkspace as isPersonalWorkspaceUtil,
  normalizeWorkspaceId as normalizeWorkspaceIdUtil,
} from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import type { NextRequest } from 'next/server';

/**
 * Normalizes a workspace identifier (slug or special keyword) into a UUID.
 *
 * - "personal" -> resolves actual personal workspace ID via getWorkspace()
 * - All other identifiers (including "internal") -> delegated to resolveWorkspaceId()
 *
 * @param wsIdParam Raw workspace identifier from URL or request
 * @param supabase Optional Supabase client for authenticated requests
 * @param request Optional NextRequest for mobile Bearer token auth
 * @returns Resolved workspace UUID
 */
export const normalizeWorkspaceId = async (
  wsIdParam: string,
  supabase?: TypedSupabaseClient,
  request?: NextRequest
): Promise<string> => {
  const normalized = wsIdParam.toLowerCase();

  if (normalized === PERSONAL_WORKSPACE_SLUG) {
    // Use the util version with auth context if available
    if (supabase || request) {
      return normalizeWorkspaceIdUtil(wsIdParam, supabase, request);
    }
    const workspace = await getWorkspace(wsIdParam);
    if (!workspace) notFound();
    return workspace.id;
  }

  return resolveWorkspaceId(wsIdParam);
};

/**
 * Check if a workspace ID corresponds to a personal workspace
 * @param workspaceId - The workspace ID to check
 * @returns true if the workspace is personal, false otherwise
 */
export const isPersonalWorkspace = async (
  workspaceId: string
): Promise<boolean> => {
  return isPersonalWorkspaceUtil(workspaceId);
};

/**
 * Fetches a workspace configuration by ID.
 *
 * @param wsId - The workspace ID
 * @param configId - The configuration ID
 * @returns The configuration value or null if not found
 */
export const getWorkspaceConfig = async (
  wsId: string,
  configId: string
): Promise<string | null> => {
  return getWorkspaceConfigUtil(wsId, configId);
};
