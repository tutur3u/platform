import {
  EXTERNAL_PROJECT_ADMIN_PATHS,
  externalProjectAdminBindingMatches,
  resolveExternalProjectAdminMapping,
} from '@tuturuuu/utils/external-project-admin-binding';
import { readBoundedResponseBytes } from '@tuturuuu/utils/read-bounded-response';
import { NextResponse } from 'next/server';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { hasWorkspaceExternalProjectPermission } from '@/lib/external-projects/access-mode';

const noStore = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie, Authorization',
};

/** Server-to-server authorization; callers must deny access on every non-200 result. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  let origin: unknown;
  try {
    const bytes = await readBoundedResponseBytes({
      response: request,
      maxBytes: 512,
    });
    origin = JSON.parse(new TextDecoder().decode(bytes))?.origin;
  } catch {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400, headers: noStore }
    );
  }
  const mapping =
    typeof origin === 'string'
      ? resolveExternalProjectAdminMapping(
          process.env.EXTERNAL_PROJECT_ADMIN_BINDINGS,
          origin
        )
      : null;
  if (!mapping || mapping.workspaceId !== wsId) {
    return NextResponse.json(
      { error: 'Unavailable' },
      { status: 404, headers: noStore }
    );
  }
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'edit',
    request,
    wsId,
  });
  if (!access.ok) {
    access.response.headers.set('Cache-Control', 'private, no-store');
    access.response.headers.set('Vary', noStore.Vary);
    return access.response;
  }
  const user = { email: access.user.email ?? null };
  if (
    access.workspacePermissions?.membershipType !== 'MEMBER' ||
    !hasWorkspaceExternalProjectPermission(
      access.workspacePermissions,
      'edit'
    ) ||
    !externalProjectAdminBindingMatches({
      mapping,
      binding: access.binding,
      workspaceId: access.normalizedWorkspaceId,
    })
  )
    return NextResponse.json(
      { error: 'Forbidden', user },
      { status: 403, headers: noStore }
    );
  return NextResponse.json(
    { paths: EXTERNAL_PROJECT_ADMIN_PATHS, user },
    { headers: noStore }
  );
}
