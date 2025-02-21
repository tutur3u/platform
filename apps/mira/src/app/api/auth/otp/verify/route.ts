import { createClient } from '@tutur3u/supabase/next/server';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: Request) {
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

  return NextResponse.json({ message: 'OTP verified successfully' });
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
