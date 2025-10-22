import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const UpdateUserSchema = z.object({
  display_name: z.string().min(0).max(50).optional(),
  bio: z.string().max(500).optional(),
  avatar_url: z.string().url().optional().or(z.literal('')),
  handle: z
    .string()
    .min(3, { message: 'Username must be at least 3 characters' })
    .max(30, { message: 'Username must be at most 30 characters' })
    .regex(/^[a-zA-Z0-9_-]+$/, {
      message: 'Username can only contain letters, numbers, hyphens, and underscores',
    })
    .optional(),
});

export async function PATCH(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const payload = await req.json();

    // Validate the payload
    const validationResult = UpdateUserSchema.safeParse(payload);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          message: 'Validation error',
          errors: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const validatedData = validationResult.data;

    // Filter out undefined values
    const updateData = Object.fromEntries(
      Object.entries(validatedData).filter(([_, v]) => v !== undefined)
    );

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { message: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', user.id)
      .select();

    if (error) {
      // Check if it's a duplicate handle error
      if (error.message?.includes('Handle already taken')) {
        return NextResponse.json(
          { message: 'Handle already taken' },
          { status: 409 }
        );
      }

      console.error('Error updating user:', error);
      return NextResponse.json(
        { message: error.message || 'Error updating user' },
        { status: 500 }
      );
    }

    return NextResponse.json({ users: data });
  } catch (error) {
    console.error('Request error:', error);
    return NextResponse.json(
      {
        message: 'Error processing request',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
