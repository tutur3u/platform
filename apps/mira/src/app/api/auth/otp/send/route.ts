import { createAdminClient, createClient } from '@repo/supabase/next/server';
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

const validateEmail = async (email?: string | null) => {
  if (!email) throw 'Email is required';

  const regex = /\S+@\S+\.\S+/;
  if (!regex.test(email)) throw 'Email is invalid';

  return email;
};

const checkIfUserExists = async ({ email }: { email: string }) => {
  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('user_private_details')
    .select('id:user_id')
    .eq('email', email)
    .maybeSingle();

  if (error) throw error.message;
  return !!data;
};

const generateRandomPassword = () => {
  const length = 16;
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=';

  let temp = '';
  for (let i = 0, n = charset.length; i < length; ++i)
    temp += charset.charAt(Math.floor(Math.random() * n));

  return temp;
};
