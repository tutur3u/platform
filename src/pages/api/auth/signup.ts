import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../clients/supabase';
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

    // If the identifier is an email, signup with email

    const session = await signup(email, password);
    return res.status(200).json(session);
  } catch (error) {
    return res.status(500).json({
      error: { message: (error as Error).message },
    });
  }
};

const signup = async (email: string, password: string) => {
  const { data: session, error } = await supabase.auth.signUp({
    email,
    password,
  });

  // Check if there is an error
  if (error) throw error?.message;

  // Check if the session is valid
  if (!session) throw 'Something went wrong';

  return session;
};

export default handler;
