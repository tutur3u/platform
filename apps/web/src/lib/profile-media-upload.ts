import {
  type ProfileMediaKind,
  ProfileUploadError,
} from '@tuturuuu/storage-core/profile-upload-budget';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';
import { createOptimizedProfileMediaTicket } from './profile-media-ticket';

export const profileMediaFilenameSchema = z.object({
  filename: z
    .string()
    .min(3)
    .max(200)
    .regex(/^[^\\/]+\.(png|jpe?g|webp|gif)$/i)
    .refine((value) =>
      [...value].every(
        (char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127
      )
    ),
});
export function createProfileMediaUploadHandler(kind: ProfileMediaKind) {
  return withSessionAuth(
    async (req, { user }) => {
      try {
        profileMediaFilenameSchema.parse(await req.json());
        const ticket = await createOptimizedProfileMediaTicket(
          user.id,
          kind,
          process.env.NEXT_PUBLIC_APP_URL || req.url
        );
        return NextResponse.json(ticket, {
          headers: { 'Cache-Control': 'no-store' },
        });
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError)
          return NextResponse.json(
            { message: 'Invalid image filename' },
            { status: 400 }
          );
        if (error instanceof ProfileUploadError)
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
        console.error('Unable to issue profile media upload ticket');
        return NextResponse.json(
          { message: 'Profile upload unavailable' },
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
}
