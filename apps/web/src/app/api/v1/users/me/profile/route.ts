import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { isValidNewUsername } from '@tuturuuu/utils/username-policy';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLegacyHeadHandler } from '@/legacy-api-routes/head';
import {
  CURRENT_USER_PROFILE_READ_APP_SESSION_AUTH,
  CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH,
} from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
const PatchProfileSchema = z.object({
  display_name: z.string().min(1).max(MAX_DISPLAY_NAME_LENGTH).optional(),
  bio: z.string().max(MAX_BIO_LENGTH).nullable().optional(),
  avatar_url: z.url().max(2000).refine(isHttpsUrl).nullable().optional(),
  banner_url: z.url().max(2000).refine(isHttpsUrl).nullable().optional(),
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isValidNewUsername)
    .nullable()
    .optional(),
});

export const GET = withSessionAuth(
  async (_req, { user, supabase }) => {
    try {
      await connection();
      // Fetch user profile data
      let { data: userData, error: userError } = await supabase
        .from('users')
        .select(
          'id, display_name, avatar_url, banner_url, bio, handle, created_at'
        )
        .eq('id', user.id)
        .maybeSingle();

      if (userError && ['42703', 'PGRST204'].includes(userError.code)) {
        const legacy = await supabase
          .from('users')
          .select('id,display_name,avatar_url,bio,handle,created_at')
          .eq('id', user.id)
          .maybeSingle();
        userData = legacy.data ? { ...legacy.data, banner_url: null } : null;
        userError = legacy.error;
      }
      if (userError) {
        console.error('Error fetching user profile:', { code: userError.code });
        return NextResponse.json(
          { message: 'Error fetching user profile' },
          { status: 500 }
        );
      }

      // Fetch private details (includes email)
      const { data: privateData, error: privateError } = await supabase
        .from('user_private_details')
        .select('full_name, new_email, email, default_workspace_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (privateError) {
        console.error('Error fetching user private profile details:', {
          error: privateError.message,
          userId: user.id,
        });
        return NextResponse.json(
          { message: 'Error fetching user profile' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        id: userData?.id ?? user.id,
        email: privateData?.email ?? null,
        display_name: userData?.display_name ?? null,
        avatar_url: userData?.avatar_url ?? null,
        banner_url: userData?.banner_url ?? null,
        bio: userData?.bio ?? null,
        handle: userData?.handle ?? null,
        full_name: privateData?.full_name ?? null,
        new_email: privateData?.new_email ?? null,
        created_at: userData?.created_at ?? user.created_at ?? null,
        default_workspace_id: privateData?.default_workspace_id ?? null,
      });
    } catch (error) {
      console.error('Request error while fetching user profile:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  {
    allowAppSessionAuth: CURRENT_USER_PROFILE_READ_APP_SESSION_AUTH,
    cache: { maxAge: 0, swr: 0 },
  }
);

export const PATCH = withSessionAuth(
  async (req, { user, supabase }) => {
    try {
      const body = await req.json();
      const validatedData = PatchProfileSchema.parse(body);

      const updates: z.infer<typeof PatchProfileSchema> = {
        ...validatedData,
      };

      if (Object.keys(updates).length === 0) {
        return NextResponse.json(
          { message: 'No valid fields to update' },
          { status: 400 }
        );
      }

      const admin = await createAdminClient({ noCookie: true });
      let { error } = await admin.rpc('update_public_user_profile', {
        p_user_id: user.id,
        p_patch: updates,
      });

      if (error && ['42883', 'PGRST202'].includes(error.code)) {
        if (
          'handle' in updates ||
          'banner_url' in updates ||
          'display_name' in updates
        )
          return NextResponse.json(
            { message: 'Profile identity upgrade is pending' },
            { status: 503 }
          );
        ({ error } = await supabase
          .from('users')
          .update(updates)
          .eq('id', user.id));
      }
      if (error) {
        if (error.code === 'PT429') {
          const code =
            error.hint === 'username_change_cooldown'
              ? 'username_change_cooldown'
              : 'display_name_change_limit';
          const seconds = Number(error.details);
          const retryAfter =
            Number.isSafeInteger(seconds) && seconds > 0
              ? Math.min(seconds, 14 * 86400)
              : 14 * 86400;
          return NextResponse.json(
            { message: 'Profile change limit reached', code, retryAfter },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
          );
        }
        if (error.code === '23505')
          return NextResponse.json(
            { message: 'Username is unavailable' },
            { status: 409 }
          );
        if (error.code === '22023')
          return NextResponse.json(
            { message: 'Invalid request data' },
            { status: 400 }
          );
        if (error.code === 'P0002')
          return NextResponse.json(
            { message: 'Profile not found' },
            { status: 404 }
          );
        console.error('Error updating user profile:', { code: error.code });
        return NextResponse.json(
          { message: 'Internal server error' },
          { status: 500 }
        );
      }

      return NextResponse.json({ message: 'Profile updated successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { message: 'Invalid request data', errors: error.issues },
          { status: 400 }
        );
      }

      console.error('Request error while updating user profile:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  {
    allowAppSessionAuth: CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH,
    skipAppSessionStepUpChallenge: true,
  }
);

export const HEAD = createLegacyHeadHandler(GET);
