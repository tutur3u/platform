import {
  ProfileUploadError,
  reserveProfileUploadBudget,
} from '@tuturuuu/storage-core/profile-upload-budget';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';
import {
  bannerStorageOrigin,
  cleanRetiredBanners,
} from '@/lib/profile-banner-lifecycle';

const PostBannerUploadSchema = z.object({
  operationId: z.uuid().optional(),
  filename: z
    .string()
    .min(3)
    .regex(/^[^\\/]+\.[^\\/]+$/),
});

export const POST = withSessionAuth(
  async (req, { user }) => {
    try {
      const body = await req.json();
      const { filename, operationId = crypto.randomUUID() } =
        PostBannerUploadSchema.parse(body);

      // Personal banners use the same authenticated ticket contract as avatars.
      const fileExt = filename.split('.').pop()?.toLowerCase();
      const allowedExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

      if (!fileExt || !allowedExtensions.has(fileExt)) {
        return NextResponse.json(
          { message: 'Invalid file extension' },
          { status: 400 }
        );
      }

      const filePath = `${user.id}/${operationId}.${fileExt}`;
      const supabase = await createDynamicAdminClient();
      const publicUrl = `${bannerStorageOrigin()}/storage/v1/object/public/banners/${filePath}`;
      const claimed = await supabase.rpc('claim_profile_banner_upload', {
        p_user_id: user.id,
        p_operation_id: operationId,
        p_file_path: filePath,
        p_public_url: publicUrl,
      });
      if (claimed.error?.code === 'PT429')
        return NextResponse.json(
          { message: 'Banner operation limit reached' },
          { status: 429 }
        );
      if (claimed.error || !claimed.data) {
        return NextResponse.json(
          { message: 'Banner lifecycle upgrade is pending' },
          { status: 503 }
        );
      }
      if (claimed.data.state === 'committed') {
        const cleaned = await cleanRetiredBanners(supabase, user.id);
        if (!cleaned)
          return NextResponse.json(
            { message: 'Banner cleanup is pending' },
            { status: 503 }
          );
        return NextResponse.json({
          committed: true,
          operationId,
          publicUrl,
          filePath,
        });
      }
      if (claimed.data.state === 'conflict')
        return NextResponse.json(
          { message: 'Banner changed during upload' },
          { status: 409 }
        );
      if (claimed.data.state === 'reserved') {
        // An interrupted budget reservation is conservatively charged again.
        // Every ticket still requires a successful reservation; issued receipts
        // reuse their immutable path without minting another quota unit.
        await reserveProfileUploadBudget(user.id, 'banner');
        const issued = await supabase.rpc('issue_profile_banner_upload', {
          p_user_id: user.id,
          p_operation_id: operationId,
        });
        if (issued.error)
          return NextResponse.json(
            { message: 'Upload reservation is pending' },
            { status: 503 }
          );
      } else if (claimed.data.state !== 'issued') {
        return NextResponse.json(
          { message: 'Upload reservation is pending' },
          { status: 503 }
        );
      }
      // A lost upload response reuses the same immutable object, not a new path.
      const existing = await supabase.storage.from('banners').info(filePath);
      if (existing.data && !existing.error)
        return NextResponse.json({
          uploaded: true,
          operationId,
          publicUrl,
          filePath,
        });
      if (
        existing.error &&
        !['404', '400'].includes(String(existing.error.statusCode))
      )
        return NextResponse.json(
          { message: 'Unable to verify upload state' },
          { status: 503 }
        );
      const { data: signedUrlData, error: signedUrlError } =
        await supabase.storage.from('banners').createSignedUploadUrl(filePath, {
          upsert: false,
        });

      if (signedUrlError || !signedUrlData) {
        console.error('Error creating signed upload URL:', signedUrlError);
        return NextResponse.json(
          { message: 'Error generating upload URL' },
          { status: 500 }
        );
      }

      const leased = await supabase.rpc('record_profile_banner_ticket', {
        p_user_id: user.id,
        p_operation_id: operationId,
      });
      if (leased.error || leased.data !== true)
        return NextResponse.json(
          { message: 'Banner operation changed before signing' },
          { status: 409 }
        );
      // Banners are explicitly public profile media, never a private signed read URL.

      return NextResponse.json({
        operationId,
        uploadUrl: signedUrlData.signedUrl,
        publicUrl,
        filePath,
        token: signedUrlData.token,
      });
    } catch (error) {
      if (error instanceof ProfileUploadError) {
        return NextResponse.json(
          {
            message: error.message,
            code: 'profile_upload_limit',
            retryAfter: error.retryAfter,
          },
          {
            status: error.status,
            headers: error.retryAfter
              ? { 'Retry-After': String(error.retryAfter) }
              : undefined,
          }
        );
      }
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        return NextResponse.json(
          {
            message: 'Invalid request data',
            errors: error instanceof z.ZodError ? error.issues : undefined,
          },
          { status: 400 }
        );
      }

      console.error('Request error:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  // Upload URL generation — moderate limit to prevent storage abuse
  {
    allowAppSessionAuth: CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH,
    rateLimit: { windowMs: 60000, maxRequests: 10 },
    skipAppSessionStepUpChallenge: true,
  }
);
