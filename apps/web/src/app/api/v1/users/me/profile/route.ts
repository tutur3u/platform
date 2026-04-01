import {
  MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

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
        .single();

      if (userError) {
        console.error('Error fetching user:', userError);
        return NextResponse.json(
          { message: 'Error fetching user profile' },
          { status: 500 }
        );
      }

      // Fetch private details (includes email)
      const { data: privateData } = await supabase
        .from('user_private_details')
        .select('full_name, new_email, email, default_workspace_id')
        .eq('user_id', user.id)
        .maybeSingle();

      return NextResponse.json({
        id: userData.id,
        email: privateData?.email || user.email || null,
        display_name: userData.display_name,
        avatar_url: userData.avatar_url,
        full_name: privateData?.full_name || null,
        new_email: privateData?.new_email || null,
        created_at: userData.created_at,
        default_workspace_id: privateData?.default_workspace_id || null,
      });
    } catch (error) {
      console.error('Request error:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { cache: { maxAge: 60, swr: 30 } }
);

export const PATCH = withSessionAuth(async (req, { user, supabase }) => {
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
      console.error('Error updating user:', error);
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

    console.error('Request error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
});
