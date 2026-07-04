import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const UpdatePasswordSchema = z.object({
  password: z.string().min(8),
  nonce: z.string().trim().min(1).optional(),
});

function isReauthenticationNeeded(error: { message?: string; code?: string }) {
  return (
    error.code === 'reauthentication_needed' ||
    error.message?.includes('reauthentication_needed') ||
    error.message?.includes('reauthentication')
  );
}

export const POST = withSessionAuth(async (request, { supabase }) => {
  try {
    const body = UpdatePasswordSchema.safeParse(await request.json());

    if (!body.success) {
      return NextResponse.json(
        { message: 'Invalid request data', errors: body.error.issues },
        { status: 400 }
      );
    }

    const { password, nonce } = body.data;
    const { error } = await supabase.auth.updateUser({
      password,
      ...(nonce ? { nonce } : {}),
    });

    if (error) {
      if (isReauthenticationNeeded(error)) {
        return NextResponse.json(
          {
            code: 'reauthentication_needed',
            message: 'Reauthentication required before changing password',
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          code: error.code,
          message: error.message || 'Failed to update password',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating password:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
});
