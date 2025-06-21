import { createAdminClient, createClient } from '@ncthub/supabase/next/server';
import {
  checkIfUserExists,
  generateRandomPassword,
  validateEmail,
} from '@ncthub/utils/email';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: Request) {
  const { locale, email } = await request.json();
  const validatedEmail = await validateEmail(email);

  const userId = await checkIfUserExists({ email: validatedEmail });

  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  if (userId) {
    const { error: updateError } = await sbAdmin.auth.admin.updateUserById(
      userId,
      {
        user_metadata: { locale, origin: 'TUTURUUU' },
      }
    );

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: validatedEmail,
      options: { data: { locale, origin: 'TUTURUUU' } },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  } else {
    const randomPassword = generateRandomPassword();

    const { error } = await supabase.auth.signUp({
      email: validatedEmail,
      password: randomPassword,
      options: {
        data: { locale, origin: 'TUTURUUU' },
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ message: 'OTP sent successfully' });
}
