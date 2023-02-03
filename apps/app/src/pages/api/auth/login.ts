import { SupabaseClient } from '@supabase/auth-helpers-react';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { AuthRequest, AuthResponse } from '../../../types/AuthData';

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse<AuthResponse>
) => {
  try {
    const { username, email, password }: AuthRequest = req.body;

    //* Basic validation
    // Check if all required fields are present
    if ((!username && !email) || !password)
      return res.status(400).json({
        error: {
          message: 'Not all required fields are present',
        },
      });

    // Validate if the email is valid
    const validEmail = email ? /^[^@]+@[^@]+\.[^@]+$/.test(email) : false;

    // Validate if the username is valid
    const validUsername = username
      ? /^[a-zA-Z0-9]+$/.test(username) &&
        username.length >= 3 &&
        username.length <= 20
      : false;

    if (!validEmail && !validUsername)
      return res.status(400).json({
        error: {
          message: 'Invalid email or username',
        },
      });

    // Validate if the password is valid
    const validPassword = password ? /^.{8,}$/.test(password) : false;

    if (!validPassword)
      return res.status(400).json({
        error: {
          message: 'Invalid password',
        },
      });

    const supabase = createServerSupabaseClient({
      req,
      res,
    });

    // If the identifier is an email, login with email~
    if (email) {
      const session = await loginWithEmail(supabase, email, password);
      return res.status(200).json(session);
    }

    // If the identifier is a username, login with username
    if (username) {
      const session = await loginWithUsername(supabase, username, password);
      return res.status(200).json(session);
    }

    // If the identifier is neither an email nor a username, throw an error
    throw 'Invalid credentials';
  } catch (error: any) {
    return res.status(500).json({
      error: {
        message: error || 'Something went wrong',
      },
    });
  }
};

const loginWithEmail = async (
  supabase: SupabaseClient,
  email: string,
  password: string
) => {
  const { data: session, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  // Check if there is an error
  if (error) throw error?.message;

  // Check if the session is valid
  if (!session) throw 'Something went wrong';

  return session;
};

const loginWithUsername = async (
  supabase: SupabaseClient,
  username: string,
  password: string
) => {
  const { data, error } = await supabase
    .from('users')
    .select('email')
    .eq('username', username)
    .single();

  // Check if there is an error
  // while fetching the user
  if (error) throw 'Something went wrong while fetching the user';

  // Check if the user exists
  if (!data) throw 'Invalid credentials';

  const email: string = data?.email || '';

  // Check if the email is valid
  if (!email) throw 'Something went wrong';

  return loginWithEmail(supabase, email, password);
};

export default handler;
