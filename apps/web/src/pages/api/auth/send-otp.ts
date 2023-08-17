import { SupabaseClient } from '@supabase/auth-helpers-react';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { AuthRequest, AuthResponse } from '../../../types/AuthData';

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse<AuthResponse>
) => {
  try {
    const { email }: AuthRequest = req.body;

    //* Basic validation
    // Check if all required fields are present
    if (!email)
      return res.status(400).json({
        error: {
          message: 'Not all required fields are present',
        },
      });

    // Validate if the email is valid
    const validEmail = email ? /^[^@]+@[^@]+\.[^@]+$/.test(email) : false;

    if (!validEmail)
      return res.status(400).json({
        error: {
          message: 'Invalid email',
        },
      });

    const supabase = createPagesServerClient({
      req,
      res,
    });

    await sendOtp(supabase, email);
    return res.status(200).json({});
  } catch (error) {
    return res.status(400).json({
      error: {
        message: typeof error === 'string' ? error : 'Something went wrong',
      },
    });
  }
};

const sendOtp = async (supabase: SupabaseClient, email: string) => {
  const { error } = await supabase.auth.signInWithOtp({
    email,
  });

  if (error) throw error?.message;
};

export default handler;
