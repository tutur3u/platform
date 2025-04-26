import { createClient } from '@tuturuuu/supabase/next/server';
import {
  checkIfUserExists,
  generateRandomPassword,
  validateEmail,
} from '@tuturuuu/utils/email';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: Request) {
  const { email } = await request.json();
  const validatedEmail = await validateEmail(email);

  const userExists = await checkIfUserExists({ email: validatedEmail });
  const supabase = await createClient();

  if (userExists) {
    const { error } = await supabase.auth.signInWithOtp({
      email: validatedEmail,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  } else {
    const randomPassword = generateRandomPassword();

    const { error } = await supabase.auth.signUp({
      email: validatedEmail,
      password: randomPassword,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ message: 'OTP sent successfully' });
}
