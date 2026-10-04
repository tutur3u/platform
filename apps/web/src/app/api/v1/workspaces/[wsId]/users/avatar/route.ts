import { ProfileUploadError } from '@tuturuuu/storage-core/profile-upload-budget';
import { handleGetAvatarRequest } from '@tuturuuu/users-core/routes/users/avatar';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';
import { createOptimizedProfileMediaTicket } from '@/lib/profile-media-ticket';

export async function GET(
  request: Request,
  context: Parameters<typeof handleGetAvatarRequest>[1]
) {
  await connection();
  return handleGetAvatarRequest(request, context);
}
export const POST = withSessionAuth<{ wsId: string }>(
  async (request, { user }, { wsId }) => {
    const permissions = await getPermissions({ wsId, user, request });
    if (!permissions?.containsPermission('manage_users'))
      return NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      );
    const body = await request.json().catch(() => null);
    if (
      !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(
        body?.contentType
      )
    )
      return NextResponse.json(
        { message: 'Invalid image type' },
        { status: 400 }
      );
    try {
      const ticket = await createOptimizedProfileMediaTicket(
        user.id,
        'avatar',
        process.env.NEXT_PUBLIC_APP_URL || request.url,
        undefined,
        `${permissions.wsId}/users`
      );
      return NextResponse.json(
        { ...ticket, path: ticket.filePath },
        {
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    } catch (error) {
      return NextResponse.json(
        { message: 'Avatar upload unavailable' },
        {
          status: error instanceof ProfileUploadError ? error.status : 503,
          headers:
            error instanceof ProfileUploadError && error.retryAfter
              ? { 'Retry-After': String(error.retryAfter) }
              : undefined,
        }
      );
    }
  },
  {
    allowAppSessionAuth: CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH,
    rateLimit: { windowMs: 60000, maxRequests: 10 },
    skipAppSessionStepUpChallenge: true,
  }
);
