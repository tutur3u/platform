import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import {
  requireWorkspaceExternalProjectAccess,
  resolveWorkspaceExternalProjectBinding,
} from '@/lib/external-projects/access';
import {
  EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL,
  EXTERNAL_PROJECT_PUBLIC_CACHE_CONTROL,
  externalProjectAssetCacheTag,
  workspaceExternalProjectCacheTag,
} from '@/lib/external-projects/cache';
import {
  ifNoneMatchMatches,
  MAX_VERCEL_CACHE_TAGS,
} from '@/lib/external-projects/http-cache';
import { buildWorkspaceExternalProjectDeliveryPayload } from '@/lib/external-projects/store';

const privateHeaders = {
  'Cache-Control': EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL,
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const url = new URL(request.url);
  const preview = url.searchParams.get('preview') === 'true';

  try {
    if (preview) {
      const access = await requireWorkspaceExternalProjectAccess({
        mode: 'publish',
        request,
        wsId,
      });
      if (!access.ok) return access.response;

      const payload = await buildWorkspaceExternalProjectDeliveryPayload(
        {
          binding: access.binding,
          includeDrafts: true,
          workspaceId: access.normalizedWorkspaceId,
        },
        access.admin
      );

      return NextResponse.json(payload, { headers: privateHeaders });
    }

    const admin = (await createAdminClient()) as TypedSupabaseClient;
    const binding = await resolveWorkspaceExternalProjectBinding(wsId, admin);

    if (!binding.enabled || !binding.canonical_project) {
      return NextResponse.json(
        { error: 'External project delivery unavailable for this workspace' },
        { headers: privateHeaders, status: 404 }
      );
    }

    const payload = await buildWorkspaceExternalProjectDeliveryPayload(
      {
        binding,
        includeDrafts: false,
        workspaceId: wsId,
      },
      admin
    );

    const etag = `W/"${payload.revision}"`;
    const assetCacheTags = payload.collections.flatMap((collection) =>
      collection.entries.flatMap((entry) =>
        entry.assets.map((asset) => externalProjectAssetCacheTag(asset.id))
      )
    );
    const cacheTags = [
      workspaceExternalProjectCacheTag(wsId),
      ...[...new Set(assetCacheTags)].slice(0, MAX_VERCEL_CACHE_TAGS - 1),
    ];
    const publicHeaders = {
      'Cache-Control': EXTERNAL_PROJECT_PUBLIC_CACHE_CONTROL,
      ETag: etag,
      'Vercel-CDN-Cache-Control': 'max-age=86400, stale-while-revalidate=43200',
      'Vercel-Cache-Tag': cacheTags.join(','),
    };

    if (ifNoneMatchMatches(request.headers.get('if-none-match'), etag)) {
      return new NextResponse(null, { headers: publicHeaders, status: 304 });
    }

    return NextResponse.json(payload, { headers: publicHeaders });
  } catch (error) {
    console.error('Failed to build external project delivery payload', error);
    return NextResponse.json(
      { error: 'Failed to build external project delivery payload' },
      { headers: privateHeaders, status: 500 }
    );
  }
}
