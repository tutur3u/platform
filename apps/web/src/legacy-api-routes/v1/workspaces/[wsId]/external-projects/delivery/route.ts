import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { isWorkspaceUuidLiteral } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import {
  requireWorkspaceExternalProjectAccess,
  resolveWorkspaceExternalProjectBinding,
} from '@/lib/external-projects/access';
import {
  EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL,
  externalProjectAssetCacheTag,
  workspaceExternalProjectCacheTag,
} from '@/lib/external-projects/cache';
import {
  CMS_DELIVERY_CACHE_CONTROL,
  CMS_DELIVERY_CDN_CACHE_CONTROL,
} from '@/lib/external-projects/delivery-cache';
import {
  ifNoneMatchMatches,
  MAX_VERCEL_CACHE_TAGS,
} from '@/lib/external-projects/http-cache';
import { attachPublishedPageVersions } from '@/lib/external-projects/published-delivery';
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
        mode: 'edit',
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

    const resolvedWsId = resolveWorkspaceId(wsId);
    if (!isWorkspaceUuidLiteral(resolvedWsId)) {
      return NextResponse.json(
        { error: 'Invalid workspace ID' },
        { status: 400 }
      );
    }

    const admin = (await createAdminClient()) as TypedSupabaseClient;
    const binding = await resolveWorkspaceExternalProjectBinding(
      resolvedWsId,
      admin
    );

    if (!binding.enabled || !binding.canonical_project) {
      return NextResponse.json(
        { error: 'External project delivery unavailable for this workspace' },
        { headers: privateHeaders, status: 409 }
      );
    }

    const legacyPayload = await buildWorkspaceExternalProjectDeliveryPayload(
      {
        binding,
        includeDrafts: false,
        workspaceId: resolvedWsId,
      },
      admin
    );

    const payload = await attachPublishedPageVersions(legacyPayload, admin);

    const etag = `W/"${payload.revision}"`;
    const assetCacheTags = payload.collections.flatMap((collection) =>
      collection.entries.flatMap((entry) =>
        entry.assets.map((asset) => externalProjectAssetCacheTag(asset.id))
      )
    );
    const cacheTags = [
      workspaceExternalProjectCacheTag(resolvedWsId),
      ...[...new Set(assetCacheTags)].slice(0, MAX_VERCEL_CACHE_TAGS - 1),
    ];
    const publicHeaders = {
      'Cache-Control': CMS_DELIVERY_CACHE_CONTROL,
      ETag: etag,
      'Vercel-CDN-Cache-Control': CMS_DELIVERY_CDN_CACHE_CONTROL,
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
