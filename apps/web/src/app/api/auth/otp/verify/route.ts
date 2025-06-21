import { createAdminClient, createClient } from '@ncthub/supabase/next/server';
import { validateEmail, validateOtp } from '@ncthub/utils/email';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: Request) {
  const { locale, email, otp } = await request.json();

  const validatedEmail = await validateEmail(email);
  const validatedOtp = await validateOtp(otp);

  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    email: validatedEmail,
    token: validatedOtp,
    type: 'email',
  });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return NextResponse.json({ error: 'User not found' }, { status: 400 });

  const { error: updateError } = await sbAdmin.auth.admin.updateUserById(
    user.id,
    {
      user_metadata: { locale, origin: 'TUTURUUU' },
    }
  );

  if (updateError)
    return NextResponse.json({ error: updateError.message }, { status: 400 });

  const cookieStore = await cookies();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const supabaseCookies = cookieStore
    .getAll()
    .filter(({ name }) => name.startsWith('sb-'))
    .map(({ name, value }) => ({ name, value }));

  return NextResponse.json({
    message: 'OTP verified successfully',
    cookies: supabaseCookies,
    session,
  });
}
