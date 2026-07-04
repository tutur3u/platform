import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

export const POST = withSessionAuth(async (_request, { supabase }) => {
  try {
    const { error } = await supabase.auth.reauthenticate();

    if (error) {
      return NextResponse.json(
        {
          code: error.code,
          message: error.message || 'Failed to send verification code',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending reauthentication code:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
});
