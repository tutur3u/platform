import { NextResponse } from 'next/server';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { getExternalProjectCmsEditorCapabilities } from '@/lib/external-projects/cms-capabilities';
import { getWorkspaceExternalProjectStudioData } from '@/lib/external-projects/store';
import { getWorkspaceExternalProjectScopedStudioData } from '@/lib/external-projects/store-studio-scope';

const MAX_SCOPED_COLLECTIONS = 24;
const COLLECTION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readCollectionSlugs(request: Request) {
  const values = new URL(request.url).searchParams
    .getAll('collectionSlugs')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  const collectionSlugs = [...new Set(values)];

  if (
    collectionSlugs.length > MAX_SCOPED_COLLECTIONS ||
    collectionSlugs.some(
      (slug) => slug.length > 80 || !COLLECTION_SLUG_PATTERN.test(slug)
    )
  ) {
    return null;
  }

  return collectionSlugs;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'read',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  const collectionSlugs = readCollectionSlugs(request);
  if (!collectionSlugs) {
    return NextResponse.json(
      { error: 'Invalid collectionSlugs query' },
      { status: 400 }
    );
  }

  try {
    const studio = collectionSlugs.length
      ? await getWorkspaceExternalProjectScopedStudioData(
          access.normalizedWorkspaceId,
          collectionSlugs,
          access.admin
        )
      : await getWorkspaceExternalProjectStudioData(
          access.normalizedWorkspaceId,
          access.admin
        );

    return NextResponse.json({
      binding: access.binding,
      ...studio,
      cmsCapabilities: getExternalProjectCmsEditorCapabilities({
        binding: access.binding,
        collections: studio.collections,
        fieldDefinitions: studio.fieldDefinitions,
      }),
    });
  } catch (error) {
    console.error('Failed to load external project studio', error);
    return NextResponse.json(
      { error: 'Failed to load external project studio' },
      { status: 500 }
    );
  }
}
