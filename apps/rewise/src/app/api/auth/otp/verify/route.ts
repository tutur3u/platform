import { createClient } from '@tuturuuu/supabase/next/server';
import { validateEmail, validateOtp } from '@tuturuuu/utils/email';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);

  const { email, otp } = await request.json();

  const validatedEmail = await validateEmail(email);
  const validatedOtp = await validateOtp(otp);

  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    email: validatedEmail,
    token: validatedOtp,
    type: 'email',
  });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.redirect(requestUrl.origin, {
    // a 301 status is required to redirect from a POST to a GET route
    status: 301,
  });
}
