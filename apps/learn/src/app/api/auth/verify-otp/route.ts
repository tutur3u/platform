import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().min(4).max(12),
});

export async function POST(request: NextRequest) {
  const parsed = verifyOtpSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid verification payload' },
      { status: 400 }
    );
  }

  const supabase = await createClient(request);
  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.otp,
    type: 'email',
  });

  if (error) {
    return NextResponse.json(
      { message: 'Verification failed. Please try again.' },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
