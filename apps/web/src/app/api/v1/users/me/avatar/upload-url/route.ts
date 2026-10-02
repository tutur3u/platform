import { reserveSecurityBudget } from '@tuturuuu/storage-core/security-budget';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';

const PostAvatarUploadSchema = z.object({
  filename: z
    .string()
    .min(3)
    .regex(/^[^\\/]+\.[^\\/]+$/),
});

export const POST = withSessionAuth(
  async (req, { user }) => {
    try {
      const body = await req.json();
      const { filename } = PostAvatarUploadSchema.parse(body);

      // Preserve the existing upload request and response contract.
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
      const day = new Date().toISOString().slice(0, 10);
      const avatarBytes = 2 * 1024 * 1024;
      const [accepted] = await reserveSecurityBudget([
        [
          `api-cost:v1:avatar-ticket:user:${user.id}:${day}`,
          avatarBytes,
          20 * avatarBytes,
          172800,
        ],
        [
          `api-cost:v1:avatar-ticket:global:${day}`,
          avatarBytes,
          1024 * 1024 * 1024,
          172800,
        ],
      ]);
      if (!accepted) {
        return NextResponse.json(
          { message: 'Avatar upload limit reached' },
          { status: 429 }
        );
      }
      // Raw authenticated Storage writes are denied by the shared media policy.
      // Only this authenticated, budgeted API issues privileged scoped tickets.
      const supabase = await createDynamicAdminClient();
      const { data: signedUrlData, error: signedUrlError } =
        await supabase.storage.from('avatars').createSignedUploadUrl(filePath, {
          upsert: false,
        });

      if (signedUrlError || !signedUrlData) {
        console.error('Error creating signed upload URL:', signedUrlError);
        return NextResponse.json(
          { message: 'Error generating upload URL' },
          { status: 500 }
        );
      }

      // Get the public URL for the file
      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      return NextResponse.json({
        uploadUrl: signedUrlData.signedUrl,
        publicUrl: publicUrlData.publicUrl,
        filePath,
        token: signedUrlData.token,
      });
    } catch (error) {
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
