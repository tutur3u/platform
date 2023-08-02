import { SupabaseClient } from '@supabase/auth-helpers-react';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { AuthRequest, AuthResponse } from '../../../types/AuthData';

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse<AuthResponse>
) => {
  try {
    const { handle, email, password, otp }: AuthRequest = req.body;

    const hasAccountIdentifier = !!handle || !!email;
    const hasCredentials = !!password || !!otp;

    //* Basic validation
    // Check if all required fields are present
    if (!hasAccountIdentifier || !hasCredentials)
      return res.status(400).json({
        error: {
          message: 'Not all required fields are present',
        },
      });

    // Validate if the email is valid
    const validEmail = email ? /^[^@]+@[^@]+\.[^@]+$/.test(email) : false;

    // Validate if the handle is valid
    const validUsername = handle
      ? /^[a-zA-Z0-9]+$/.test(handle) &&
        handle.length >= 3 &&
        handle.length <= 20
      : false;

    const validIdentifier = validEmail || validUsername;

    if (!validIdentifier)
      return res.status(400).json({
        error: {
          message: !validEmail ? 'Invalid email' : 'Invalid handle',
        },
      });

    const validPassword = password ? /^.{8,}$/.test(password) : false;
    const validOTP = otp ? /^[0-9]{6}$/.test(otp) : false;

    const validCredentials = validPassword || validOTP;

    if (!validCredentials)
      return res.status(400).json({
        error: {
          message: !validPassword ? 'Invalid password' : 'Invalid OTP',
        },
      });

    const supabase = createPagesServerClient({
      req,
      res,
    });

    // If the identifier is an email, login with email~
    if (email) {
      const session = await loginWithEmail({ supabase, email, password, otp });
      return res.status(200).json(session);
    }

    // If the identifier is a handle, login with handle
    if (handle) {
      const session = await loginWithUsername({
        supabase,
        handle,
        password,
        otp,
      });

      return res.status(200).json(session);
    }

    // If the identifier is neither an email nor a handle, throw an error
    throw 'Invalid credentials';
  } catch (error) {
    return res.status(400).json({
      error: {
        message: typeof error === 'string' ? error : 'Something went wrong',
      },
    });
  }
};

const loginWithEmail = async ({
  supabase,
  email,
  password,
  otp,
}: {
  supabase: SupabaseClient;
  email: string;
  password?: string;
  otp?: string;
}) => {
  if (!password && !otp) throw 'Missing required fields: password or otp';

  const { data: session, error } = password
    ? await supabase.auth.signInWithPassword({
        email,
        password,
      })
    : otp
    ? await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      })
    : { data: null, error: null };

  // Check if there is an error
  if (error) throw error?.message;

  // Check if the session is valid
  if (!session) throw 'Something went wrong';

  return session;
};

const loginWithUsername = async ({
  supabase,
  handle,
  password,
  otp,
}: {
  supabase: SupabaseClient;
  handle: string;
  password?: string;
  otp?: string;
}) => {
  const { data, error } = await supabase
    .from('users')
    .select('email')
    .eq('handle', handle)
    .single();

  // Check if there is an error
  // while fetching the user
  if (error) throw 'Something went wrong while fetching the user';

  // Check if the user exists
  if (!data) throw 'Invalid credentials';

  const email: string = data?.email || '';

  // Check if the email is valid
  if (!email) throw 'Something went wrong';

  return loginWithEmail({ supabase, email, password, otp });
};

export default handler;
