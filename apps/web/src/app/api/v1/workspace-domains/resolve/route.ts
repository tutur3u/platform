import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { connection, NextResponse } from 'next/server';
import { resolveWorkspaceExternalProjectBinding } from '@/lib/external-projects/access';
import {
  EDGE_SECRET_HEADER,
  isValidEdgeSecret,
  resolveWorkspaceDomain,
} from '@/lib/workspace-domains/resolve';

const HEADERS = { 'Cache-Control': 'no-store' };

/**
 * Edge-only lookup for the tuturuuu-workspace-domains Worker. Authenticated
 * by WORKSPACE_DOMAINS_EDGE_SECRET; answers only for active, entitled
 * domains with public workspace facts.
 */
export async function GET(request: Request) {
  await connection();
  const secret = process.env.WORKSPACE_DOMAINS_EDGE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'unavailable' },
      { status: 503, headers: HEADERS }
    );
  }
  if (!isValidEdgeSecret(request.headers.get(EDGE_SECRET_HEADER), secret)) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: HEADERS }
    );
  }

  try {
    const admin = (await createAdminClient()) as TypedSupabaseClient;
    const host = new URL(request.url).searchParams.get('host');
    const resolved = await resolveWorkspaceDomain(admin, host, async (wsId) => {
      const binding = await resolveWorkspaceExternalProjectBinding(wsId, admin);
      return Boolean(binding.enabled && binding.canonical_project);
    });
    if (!resolved) {
      return NextResponse.json(
        { error: 'not_found' },
        { status: 404, headers: HEADERS }
      );
    }
    return NextResponse.json(resolved, { headers: HEADERS });
  } catch (error) {
    console.error('workspace-domains: resolve failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { error: 'unavailable' },
      { status: 503, headers: HEADERS }
    );
  }
}
