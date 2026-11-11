import { createHash, timingSafeEqual } from 'node:crypto';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { normalizeRequestHost } from '@tuturuuu/utils/workspace-domain-hostnames';

export const EDGE_SECRET_HEADER = 'x-workspace-domains-edge-secret';

/** Constant-time comparison of the edge secret header against the env secret. */
export function isValidEdgeSecret(
  provided: string | null,
  expected: string | undefined
): boolean {
  if (!provided || !expected || expected.length < 32) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export interface ResolvedWorkspaceDomain {
  wsId: string;
  name: string;
  avatarUrl: string | null;
  siteAvailable: boolean;
}

function httpsUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Public facts for an ACTIVE and still-entitled domain, or null. Never
 * returns members, settings, billing or provider state.
 */
export async function resolveWorkspaceDomain(
  admin: TypedSupabaseClient,
  rawHost: string | null,
  siteAvailable: (wsId: string) => Promise<boolean>
): Promise<ResolvedWorkspaceDomain | null> {
  const host = normalizeRequestHost(rawHost);
  if (!host) return null;

  const { data: domain, error } = await admin
    .from('workspace_domains')
    .select('id, ws_id')
    .eq('hostname', host)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !domain) return null;

  const serving = await admin
    .schema('private')
    .rpc('workspace_domain_serving_allowed', { p_domain_id: domain.id });
  if (serving.error || serving.data !== true) return null;

  const { data: workspace } = await admin
    .from('workspaces')
    .select('id, name, avatar_url, logo_url, deleted')
    .eq('id', domain.ws_id)
    .maybeSingle();
  if (!workspace || workspace.deleted) return null;

  return {
    wsId: workspace.id,
    name: workspace.name?.trim() || 'Workspace',
    avatarUrl: httpsUrl(workspace.avatar_url) ?? httpsUrl(workspace.logo_url),
    siteAvailable: await siteAvailable(workspace.id).catch(() => false),
  };
}
