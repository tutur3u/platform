import { randomUUID } from 'node:crypto';
import {
  type ProfileMediaKind,
  ProfileUploadError,
  reserveProfileUploadBudget,
} from '@tuturuuu/storage-core/profile-upload-budget';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';

const schema = z.object({
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
function publicStorageUrl(value: string) {
  const origin = process.env.SUPABASE_PUBLIC_STORAGE_ORIGIN;
  const original = new URL(value);
  if (!origin) {
    if (original.protocol !== 'https:')
      throw new ProfileUploadError(
        'Secure profile storage is unavailable',
        503
      );
    return value;
  }
  const base = new URL(origin);
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.pathname !== '/' ||
    base.search ||
    base.hash
  ) {
    throw new ProfileUploadError('Secure profile storage is unavailable', 503);
  }
  return new URL(original.pathname + original.search, base.origin).toString();
}
export function createProfileMediaUploadHandler(kind: ProfileMediaKind) {
  return withSessionAuth(
    async (req, { user }) => {
      try {
        const { filename } = schema.parse(await req.json());
        await reserveProfileUploadBudget(user.id, kind);
        const admin = await createAdminClient({ noCookie: true });
        const bucket = kind === 'avatar' ? 'avatars' : 'banners';
        const filePath = `${user.id}/${randomUUID()}.${filename.split('.').pop()!.toLowerCase()}`;
        const storage = admin.storage.from(bucket);
        const { data, error } = await storage.createSignedUploadUrl(filePath, {
          upsert: false,
        });
        if (error || !data)
          return NextResponse.json(
            { message: 'Unable to create profile upload' },
            { status: 503 }
          );
        const { data: publicData } = storage.getPublicUrl(filePath);
        return NextResponse.json(
          {
            uploadUrl: publicStorageUrl(data.signedUrl),
            publicUrl: publicStorageUrl(publicData.publicUrl),
            filePath,
            token: data.token,
          },
          { headers: { 'Cache-Control': 'no-store' } }
        );
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
