import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const PatchEmailSchema = z.object({
  email: z.string().email(),
});

export const PATCH = withSessionAuth(
  async (req, { supabase }) => {
    try {
      const body = await req.json();
      const { email } = PatchEmailSchema.parse(body);

      const { error } = await supabase.auth.updateUser({ email });

      if (error) {
        console.error('Error updating email:', error);
        return NextResponse.json(
          { message: 'Error updating email' },
          { status: 500 }
        );
      }

      return NextResponse.json({ message: 'Email update initiated' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { message: 'Invalid email format', errors: error.issues },
          { status: 400 }
        );
      }

      console.error('Request error:', error);
      return NextResponse.json(
        { message: 'Error processing request' },
        { status: 500 }
      );
    }
  },
  // Email changes trigger verification flows — strict limit to prevent abuse
  {
    allowAppSessionAuth: true,
    rateLimit: { windowMs: 60000, maxRequests: 5 },
  }
);
