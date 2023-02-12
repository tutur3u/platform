import { SupabaseClient } from '@supabase/auth-helpers-react';

export type AuthMethod = 'login' | 'signup';
export interface AuthFormFields {
  email: string;
  password?: string;
}

interface AuthProps {
  supabaseClient: SupabaseClient;
  method: AuthMethod;
  email: string;
  password: string;
}

export const authenticate = async ({
  supabaseClient,
  method,
  email,
  password,
}: AuthProps) => {
  await fetch(`/api/auth/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
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
