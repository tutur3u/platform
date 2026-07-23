import { MAX_FULL_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH } from '../session-auth';

const PatchFullNameSchema = z.object({
  full_name: z.string().min(1).max(MAX_FULL_NAME_LENGTH),
});

export const PATCH = withSessionAuth(
  async (req, { user, supabase }) => {
    try {
      const body = await req.json();
      const { full_name } = PatchFullNameSchema.parse(body);

      const { error } = await supabase
        .from('user_private_details')
        .upsert({ user_id: user.id, full_name }, { onConflict: 'user_id' });

      if (error) {
        console.error('Error updating full name:', error);
        return NextResponse.json(
          { message: 'Error updating full name' },
          { status: 500 }
        );
      }

      return NextResponse.json({ message: 'Full name updated successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { message: 'Invalid full name', errors: error.issues },
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
  // Profile name changes — moderate limit
  {
    allowAppSessionAuth: CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH,
    rateLimit: { windowMs: 60000, maxRequests: 10 },
    skipAppSessionStepUpChallenge: true,
  }
);
