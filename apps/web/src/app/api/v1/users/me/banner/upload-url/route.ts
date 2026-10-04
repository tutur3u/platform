import {
  ProfileUploadError,
  reserveProfileUploadBudget,
} from '@tuturuuu/storage-core/profile-upload-budget';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';

const PostBannerUploadSchema = z.object({
  filename: z
    .string()
    .min(3)
    .regex(/^[^\\/]+\.[^\\/]+$/),
});

export const POST = withSessionAuth(
  async (req, { user }) => {
    try {
      const body = await req.json();
      const { filename } = PostBannerUploadSchema.parse(body);

      // Personal banners use the same authenticated ticket contract as avatars.
      const fileExt = filename.split('.').pop()?.toLowerCase();
      const allowedExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

      if (!fileExt || !allowedExtensions.has(fileExt)) {
        return NextResponse.json(
          { message: 'Invalid file extension' },
          { status: 400 }
        );
      }

      const filePath = `${user.id}/${Date.now()}.${fileExt}`;

      // Reserve the maximum Storage-enforced size before issuing a ticket;
      // failed or unused tickets are not refunded, so retries cannot evade caps.
      await reserveProfileUploadBudget(user.id, 'banner');
      // Raw authenticated Storage writes are denied by the shared media policy.
      // Only this authenticated, budgeted API issues privileged scoped tickets.
      const supabase = await createDynamicAdminClient();
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

      // Banners are explicitly public profile media, never a private signed read URL.
      const { data: publicUrlData } = supabase.storage
        .from('banners')
        .getPublicUrl(filePath);

      return NextResponse.json({
        uploadUrl: signedUrlData.signedUrl,
        publicUrl: publicUrlData.publicUrl,
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
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { message: 'Invalid request data', errors: error.issues },
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
