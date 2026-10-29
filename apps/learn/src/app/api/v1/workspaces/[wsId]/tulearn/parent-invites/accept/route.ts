import { attachSupabaseAuthUser } from '@tuturuuu/auth/app-session';
import { hasEducationEnabled } from '@tuturuuu/education-core/tulearn/service';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  acceptParentInvite,
  getVerifiedAccountEmail,
} from '@/lib/parent-invites';

type Params = {
  wsId: string;
};

const acceptInviteSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/i),
});

/**
 * Accepts an emailed parent invite. The token proves possession of the email
 * the invite was sent to; the caller's verified account email must match it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> | Params }
) {
  const user = await getSatelliteAppSessionUser('learn');
  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const parsed = acceptInviteSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid parent invite payload' },
        { status: 400 }
      );
    }

    const { wsId } = await Promise.resolve(params);
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

    const result = await acceptParentInvite(sbAdmin, {
      token: parsed.data.token,
      userId: user.id,
      verifiedEmail: await getVerifiedAccountEmail(sbAdmin, user.id),
      wsId: normalizedWsId,
    });

    if (result.ok) return NextResponse.json({ link: result.link });

    switch (result.reason) {
      case 'not_found':
        return NextResponse.json(
          { message: 'Invitation not found' },
          { status: 404 }
        );
      case 'email_mismatch':
        return NextResponse.json(
          {
            message:
              'Sign in with the verified email address this invitation was sent to',
          },
          { status: 403 }
        );
      case 'student_unbound':
        return NextResponse.json(
          {
            message:
              'The learner is no longer linked; ask the school to resend the invitation',
          },
          { status: 409 }
        );
      default:
        return NextResponse.json(
          { message: 'Invitation is no longer valid' },
          { status: 410 }
        );
    }
  } catch (error) {
    console.error('Failed to accept Tulearn parent invite:', error);
    return NextResponse.json(
      { message: 'Failed to accept parent invite' },
      { status: 500 }
    );
  }
}
