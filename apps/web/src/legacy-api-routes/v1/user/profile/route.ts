import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const UpdateProfileSchema = z.object({
  display_name: z.string().min(1).max(MAX_DISPLAY_NAME_LENGTH).optional(),
  bio: z.string().max(MAX_BIO_LENGTH).nullable().optional(),
  avatar_url: z.url().nullable().optional(),
});

export async function PATCH(req: Request) {
  const supabase = await createClient();

  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validatedData = UpdateProfileSchema.parse(body);

    const { display_name, bio, avatar_url } = validatedData;

    // Update user profile
    const { error: userError } = await supabase
      .from('users')
      .update({
        display_name,
        bio,
        avatar_url,
      })
      .eq('id', user.id);

    if (userError) {
      console.error('Error updating user:', userError);
      return NextResponse.json(
        { message: 'Error updating profile' },
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

    console.error('Profile update error:', error);
    return NextResponse.json(
      { message: 'Error updating profile' },
      { status: 500 }
    );
  }
}
