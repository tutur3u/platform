import { attachSupabaseAuthUser } from '@tuturuuu/auth/app-session';
import { hasEducationEnabled } from '@tuturuuu/education-core/tulearn/service';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { acceptPendingParentLink } from '@/lib/parent-links';

type Params = {
  linkId: string;
  wsId: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parent-only acceptance. The caller must be the link's own parent; workspace
 * staff cannot accept on a parent's behalf, so no workspace permission applies.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<Params> | Params }
) {
  const user = await getSatelliteAppSessionUser('learn');
  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { linkId, wsId } = await Promise.resolve(params);
    if (!UUID_PATTERN.test(linkId)) {
      return NextResponse.json(
        { message: 'Parent link not found' },
        { status: 404 }
      );
    }

    const sbAdmin = await createAdminClient();
    const normalizedWsId = await normalizeWorkspaceId(
      wsId,
      attachSupabaseAuthUser(
        (await createAdminClient({ noCookie: true })) as TypedSupabaseClient,
        user
      )
    );
    if (!(await hasEducationEnabled(normalizedWsId, sbAdmin))) {
      return NextResponse.json(
        { message: 'Tulearn is not enabled for this workspace' },
        { status: 404 }
      );
    }

    const result = await acceptPendingParentLink(sbAdmin, {
      linkId,
      parentUserId: user.id,
      wsId: normalizedWsId,
    });

    if (result.ok) return NextResponse.json({ link: result.link });
    if (result.reason === 'not_found') {
      return NextResponse.json(
        { message: 'Parent link not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      {
        message:
          result.reason === 'student_unbound'
            ? 'The learner is no longer linked; ask the school to resend the link'
            : 'Parent link is not awaiting acceptance',
      },
      { status: 409 }
    );
  } catch (error) {
    console.error('Failed to accept Tulearn parent link:', error);
    return NextResponse.json(
      { message: 'Failed to accept parent link' },
      { status: 500 }
    );
  }
}
