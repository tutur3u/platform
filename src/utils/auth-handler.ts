import { SupabaseClient } from '@supabase/auth-helpers-react';

export type AuthMethod = 'login' | 'signup';

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
  // If the method is empty, throw an error
  if (!method) throw new Error('No method provided');

  // If the email or password is empty, throw an error
  if (!email || !password) throw new Error('Invalid credentials');

  // Make a request to the API
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
