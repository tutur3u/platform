import { Session, SupabaseClient, User } from '@supabase/auth-helpers-react';
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

    // If the identifier is an email, login with email
    if (email) {
      const bundle = { email, password, otp };
      const authData = await loginWithEmail({ supabase, bundle });

      await setGlobalAuthCookie({ res, authData });
      return res.status(200).json({});
    }

    // If the identifier is a handle, login with handle
    if (handle) {
      const bundle = { handle, password, otp };
      const authData = await loginWithUsername({
        supabase,
        bundle,
      });

      await setGlobalAuthCookie({ res, authData });
      return res.status(200).json({});
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

const setGlobalAuthCookie = async ({
  res,
  authData,
}: {
  res: NextApiResponse;
  authData: {
    user: User | null;
    session: Session | null;
  };
}) => {
  const { user, session } = authData;
  if (!user || !session) throw 'Something went wrong';

  console.log('Setting global cookie');
  console.log(res, user, session);
};

const loginWithEmail = async ({
  supabase,
  bundle,
}: {
  supabase: SupabaseClient;
  bundle: {
    email: string;
    password?: string;
    otp?: string;
  };
}) => {
  const { email, password, otp } = bundle;

  if (!password && !otp) throw 'Missing required fields: password or otp';

  const { data, error } = password
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

  // Check if user and session are valid
  if (!data?.user || !data?.session) throw 'Something went wrong';

  return data;
};

const loginWithUsername = async ({
  supabase,
  bundle,
}: {
  supabase: SupabaseClient;
  bundle: {
    handle: string;
    password?: string;
    otp?: string;
  };
}) => {
  const { handle, password, otp } = bundle;

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

  const newBundle = {
    email,
    password,
    otp,
  };

  return loginWithEmail({ supabase, bundle: newBundle });
};

export default handler;
