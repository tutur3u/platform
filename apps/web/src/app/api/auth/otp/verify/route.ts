import { createClient } from '@/utils/supabase/server';
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

const validateEmail = async (email?: string | null) => {
  if (!email) throw 'Email is required';

  const regex = /\S+@\S+\.\S+/;
  if (!regex.test(email)) throw 'Email is invalid';

  return email;
};

const validateOtp = async (otp?: string | null) => {
  if (!otp) throw 'OTP is required';

  const regex = /^\d{6}$/;
  if (!regex.test(otp)) throw 'OTP is invalid';

  return otp;
};
