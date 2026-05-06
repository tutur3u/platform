import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const sendOtpSchema = z.object({
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  const parsed = sendOtpSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid email' }, { status: 400 });
  }

  const supabase = await createClient(request);
  const origin = request.nextUrl.origin;
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${origin}/api/auth/callback`,
      data: {
        auth_client: 'tulearn',
        origin: 'TULEARN',
      },
    },
  });

  if (error) {
    return NextResponse.json(
      { message: 'Unable to send a verification code right now' },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
