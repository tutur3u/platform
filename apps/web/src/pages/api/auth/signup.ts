import { SupabaseClient } from '@supabase/auth-helpers-react';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { AuthRequest, AuthResponse } from '../../../types/AuthData';
import { DEV_MODE } from '../../../constants/common';
import { supabaseAdmin } from '../../../utils/supabase/client';

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse<AuthResponse>
) => {
  try {
    const { email, password }: AuthRequest = req.body;

    //* Basic validation
    // Check if all required fields are present
    if (!email || !password)
      return res.status(400).json({
        error: {
          message: 'Not all required fields are present',
        },
      });

    // Validate if the email is valid
    const validEmail = email ? email.match(/^[^@]+@[^@]+\.[^@]+$/) : false;

    if (!validEmail)
      return res.status(400).json({
        error: {
          message: 'Invalid credentials',
        },
      });

    // Validate if the password is valid
    const validPassword = password ? password.match(/^.{8,}$/) : false;

    if (!validPassword)
      return res.status(400).json({
        error: {
          message: 'Invalid credentials',
        },
      });

    const supabase = createPagesServerClient({
      req,
      res,
    });

    // If the identifier is an email, signup with email
    const session = await signup(supabase, email, password);
    return res.status(200).json(session);
  } catch (error) {
    return res.status(500).json({
      error: { message: (error as Error).message },
    });
  }
};

const signup = async (
  supabase: SupabaseClient,
  email: string,
  password: string
) => {
  const { data: session, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: 'https://tuturuuu.com/onboarding',
    },
  });

  // Check if there is an error
  if (error) throw error;

  // Check if the session is valid
  if (!session) throw 'Something went wrong';

  if (DEV_MODE) {
    const sbAdmin = supabaseAdmin();
    if (!sbAdmin) throw 'Missing admin credentials';

    const { error: userError } = await sbAdmin
      .from('users')
      .update({ email_confirmed_at: new Date() })
      .eq('id', session.user?.id);

    if (userError) throw userError;
  }

  return session;
};

export default handler;
