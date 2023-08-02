import { SupabaseClient } from '@supabase/auth-helpers-react';

export type AuthMethod = 'login' | 'signup';

export interface AuthFormFields {
  email: string;
  password?: string;
  otp?: string;
}

interface AuthProps {
  supabaseClient: SupabaseClient;
  method: AuthMethod;
  email: string;
  password?: string;
  otp?: string;
}

export const sendOTP = async ({ email }: { email: string }) => {
  await fetch('/api/auth/send-otp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
    }),
  })
    .then((res) => res.json())
    .then(async (data) => {
      if (data?.error) throw data?.error;
    })
    .catch((err) => {
      throw err?.message || err || 'Something went wrong';
    });
};

export const authenticate = async ({
  supabaseClient,
  method,
  email,
  password,
  otp,
}: AuthProps) => {
  if (!password && !otp)
    throw new Error('Password or OTP is required to authenticate');

  await fetch(`/api/auth/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      otp,
    }),
  })
    .then((res) => res.json())
    .then(async (data) => {
      if (data?.error) throw data?.error;
      if (data?.session) await supabaseClient.auth.setSession(data?.session);
    })
    .catch((err) => {
      throw err?.message || err || 'Something went wrong';
    });
};
