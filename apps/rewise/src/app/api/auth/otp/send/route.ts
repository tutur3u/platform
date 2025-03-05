import { createClient } from '@tuturuuu/supabase/next/server';
import {
  checkIfUserExists,
  generateRandomPassword,
  validateEmail,
} from '@tuturuuu/utils/email';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);

  const { email } = await request.json();
  const validatedEmail = await validateEmail(email);

  const userExists = await checkIfUserExists({ email: validatedEmail });
  const supabase = await createClient();

  if (userExists) {
    const { error } = await supabase.auth.signInWithOtp({
      email: validatedEmail,
    });

    if (error) {
      return NextResponse.redirect(
        `${requestUrl.origin}/login?error=${error.message}`,
        {
          // a 301 status is required to redirect from a POST to a GET route
          status: 301,
        }
      );
    }
  } else {
    const randomPassword = generateRandomPassword();

    const { error } = await supabase.auth.signUp({
      email: validatedEmail,
      password: randomPassword,
    });

    if (error) {
      return NextResponse.redirect(
        `${requestUrl.origin}/login?error=${error.message}`,
        {
          // a 301 status is required to redirect from a POST to a GET route
          status: 301,
        }
      );
    }
  }

  return NextResponse.redirect(requestUrl.origin, {
    // a 301 status is required to redirect from a POST to a GET route
    status: 301,
  });
}
