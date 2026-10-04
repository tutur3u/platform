import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';
import {
  bannerStorageOrigin,
  cleanRetiredBanners,
  ownedBannerPath,
} from '@/lib/profile-banner-lifecycle';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('cleanup') }),
  z.object({ action: z.enum(['finalize', 'remove']), operationId: z.uuid() }),
]);

export const POST = withSessionAuth(
  async (req, { user }) => {
    try {
      const input = schema.parse(await req.json());
      const admin = await createDynamicAdminClient();
      const origin = bannerStorageOrigin();
      let state = 'committed';
      if (input.action !== 'cleanup') {
        if (input.action === 'finalize') {
          const receipt = await admin.rpc('profile_banner_operation_status', {
            p_user_id: user.id,
            p_operation_id: input.operationId,
          });
          if (receipt.error)
            return NextResponse.json(
              { message: 'Unable to verify upload' },
              { status: 503 }
            );
          if (!receipt.data)
            return NextResponse.json(
              { message: 'Upload not found' },
              { status: 404 }
            );
          if (
            receipt.data.state === 'committed' ||
            receipt.data.state === 'conflict'
          ) {
            state = receipt.data.state;
          } else {
            const path = ownedBannerPath(
              receipt.data.public_url,
              user.id,
              origin
            );
            if (!path || path !== receipt.data.file_path)
              return NextResponse.json(
                { message: 'Invalid banner path' },
                { status: 400 }
              );
            const object = await admin.storage.from('banners').info(path);
            if (object.error || !object.data)
              return NextResponse.json(
                { message: 'Upload is not ready' },
                { status: 503 }
              );
            const size = object.data.size;
            if (
              typeof size !== 'number' ||
              size <= 0 ||
              size > 5 * 1024 * 1024 ||
              !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(
                object.data.contentType
              )
            ) {
              await admin.rpc('abandon_profile_banner_operation', {
                p_user_id: user.id,
                p_operation_id: input.operationId,
                p_storage_origin: origin,
              });
              await cleanRetiredBanners(admin, user.id, origin);
              return NextResponse.json(
                { message: 'Invalid uploaded banner' },
                { status: 400 }
              );
            }
            state = 'issued';
          }
        }
        if (
          state !== 'conflict' &&
          (input.action === 'remove' || state !== 'committed')
        ) {
          const committed = await admin.rpc('commit_profile_banner_operation', {
            p_user_id: user.id,
            p_operation_id: input.operationId,
            p_storage_origin: origin,
            p_remove: input.action === 'remove',
          });
          if (committed.error?.code === 'PT429')
            return NextResponse.json(
              { message: 'Banner operation limit reached' },
              { status: 429 }
            );
          if (committed.error || !committed.data)
            return NextResponse.json(
              { message: 'Unable to save banner' },
              { status: 503 }
            );
          state = committed.data.state;
        }
      }
      const cleaned = await cleanRetiredBanners(admin, user.id, origin);
      if (!cleaned)
        return NextResponse.json(
          {
            message: 'Banner saved; cleanup is pending',
            committed: state === 'committed',
          },
          { status: 503 }
        );
      if (state === 'conflict')
        return NextResponse.json(
          { message: 'Banner changed during upload' },
          { status: 409 }
        );
      return NextResponse.json({
        message: 'Banner updated successfully',
        committed: true,
      });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return NextResponse.json(
          { message: 'Invalid request data' },
          { status: 400 }
        );
      console.error('Banner lifecycle request failed');
      return NextResponse.json(
        { message: 'Unable to update banner' },
        { status: 503 }
      );
    }
  },
  {
    allowAppSessionAuth: CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH,
    rateLimit: { windowMs: 60000, maxRequests: 20 },
    skipAppSessionStepUpChallenge: true,
  }
);
