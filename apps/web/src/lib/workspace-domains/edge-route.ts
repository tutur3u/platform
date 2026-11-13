import 'server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { connection, NextResponse } from 'next/server';
import { resolveWorkspaceExternalProjectBinding } from '@/lib/external-projects/access';
import { buildWorkspaceExternalProjectDeliveryPayload } from '@/lib/external-projects/store';
import {
  EDGE_SECRET_HEADER,
  isValidEdgeSecret,
  type ResolvedWorkspaceDomain,
  resolveWorkspaceDomain,
} from './resolve';
import { buildWorkspaceDomainSite } from './site';

const HEADERS = { 'Cache-Control': 'no-store' };
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: HEADERS });

function domainResolver(admin: TypedSupabaseClient) {
  return (host: string | null): Promise<ResolvedWorkspaceDomain | null> =>
    resolveWorkspaceDomain(admin, host, async (wsId) => {
      const binding = await resolveWorkspaceExternalProjectBinding(wsId, admin);
      return Boolean(binding.enabled && binding.canonical_project);
    });
}

/**
 * Edge-only endpoints for the tuturuuu-workspace-domains Worker,
 * authenticated by WORKSPACE_DOMAINS_EDGE_SECRET. `resolve` returns public
 * workspace facts; `site` returns published content. Both answer only for
 * active, entitled domains and 404 otherwise.
 */
export async function handleWorkspaceDomainEdgeRequest(
  request: Request,
  kind: 'resolve' | 'site'
) {
  await connection();
  const secret = process.env.WORKSPACE_DOMAINS_EDGE_SECRET;
  if (!secret) return json({ error: 'unavailable' }, 503);
  if (!isValidEdgeSecret(request.headers.get(EDGE_SECRET_HEADER), secret)) {
    return json({ error: 'unauthorized' }, 401);
  }

  try {
    const admin = (await createAdminClient()) as TypedSupabaseClient;
    const host = new URL(request.url).searchParams.get('host');
    const resolve = domainResolver(admin);
    const body =
      kind === 'resolve'
        ? await resolve(host)
        : await buildWorkspaceDomainSite(
            {
              resolve,
              assetOrigin: new URL(request.url).origin,
              publishedPayload: async (wsId) => {
                const binding = await resolveWorkspaceExternalProjectBinding(
                  wsId,
                  admin
                );
                if (!binding.enabled || !binding.canonical_project) return null;
                return buildWorkspaceExternalProjectDeliveryPayload(
                  { binding, includeDrafts: false, workspaceId: wsId },
                  admin
                );
              },
            },
            host
          );
    return body ? json(body) : json({ error: 'not_found' }, 404);
  } catch (error) {
    console.error(`workspace-domains: ${kind} failed`, {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return json({ error: 'unavailable' }, 503);
  }
}
