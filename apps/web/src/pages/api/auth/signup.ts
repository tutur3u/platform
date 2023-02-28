import { SupabaseClient } from '@supabase/auth-helpers-react';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { AuthRequest, AuthResponse } from '../../../types/AuthData';

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

    const supabase = createServerSupabaseClient({
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
      emailRedirectTo: 'https://tuturuuu.com/home',
    },
  });

  // Check if there is an error
  if (error) throw error;

  // Check if the session is valid
  if (!session) throw 'Something went wrong';

  return session;
};

export default handler;
