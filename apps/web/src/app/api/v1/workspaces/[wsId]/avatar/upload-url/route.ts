import { ProfileUploadError } from '@tuturuuu/storage-core/profile-upload-budget';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';
import { createOptimizedProfileMediaTicket } from '@/lib/profile-media-ticket';
import { profileMediaFilenameSchema } from '@/lib/profile-media-upload';

export const POST = withSessionAuth<{ wsId: string }>(
  async (request, { user }, { wsId }) => {
    try {
      const permissions = await getPermissions({ wsId, user, request });
      if (
        !permissions ||
        permissions.withoutPermission('manage_workspace_settings')
      )
        return NextResponse.json(
          { message: 'Workspace access denied' },
          { status: 403 }
        );
      profileMediaFilenameSchema.parse(await request.json());
      const ticket = await createOptimizedProfileMediaTicket(
        user.id,
        'avatar',
        process.env.NEXT_PUBLIC_APP_URL || request.url,
        permissions.wsId
      );
      return NextResponse.json(ticket, {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return NextResponse.json(
          { message: 'Invalid avatar filename' },
          { status: 400 }
        );
      if (error instanceof ProfileUploadError)
        return NextResponse.json(
          { message: error.message },
          {
            status: error.status,
            headers: error.retryAfter
              ? { 'Retry-After': String(error.retryAfter) }
              : undefined,
          }
        );
      console.error('Unable to issue workspace avatar optimization ticket');
      return NextResponse.json(
        { message: 'Avatar upload unavailable' },
        { status: 503 }
      );
    }
  },
  {
    allowAppSessionAuth: CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH,
    rateLimit: { windowMs: 60000, maxRequests: 10 },
    skipAppSessionStepUpChallenge: true,
  }
);
