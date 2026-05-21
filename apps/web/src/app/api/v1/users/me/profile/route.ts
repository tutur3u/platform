import {
  MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { CURRENT_USER_APP_SESSION_AUTH } from '../session-auth';

const PatchProfileSchema = z.object({
  display_name: z.string().min(1).max(MAX_DISPLAY_NAME_LENGTH).optional(),
  bio: z.string().max(MAX_BIO_LENGTH).nullable().optional(),
  avatar_url: z.url().nullable().optional(),
});

export const GET = withSessionAuth(
  async (_req, { user, supabase }) => {
    try {
      // Fetch user profile data
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, display_name, avatar_url, created_at')
        .eq('id', user.id)
        .maybeSingle();

      if (userError) {
        serverLogger.error('Error fetching user profile:', userError);
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
        serverLogger.error('Error fetching user private profile details:', {
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
        full_name: privateData?.full_name ?? null,
        new_email: privateData?.new_email ?? null,
        created_at: userData?.created_at ?? user.created_at ?? null,
        default_workspace_id: privateData?.default_workspace_id ?? null,
      });
    } catch (error) {
      serverLogger.error('Request error while fetching user profile:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  {
    allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH,
    cache: { maxAge: 60, swr: 30 },
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

      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id);

      if (error) {
        serverLogger.error('Error updating user profile:', error);
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

      serverLogger.error('Request error while updating user profile:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH }
);
