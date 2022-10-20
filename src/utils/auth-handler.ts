import { supabase } from '../clients/supabase';

export type AuthMethod = 'login' | 'register';

export const authenticate = async (
  method: AuthMethod,
  email: string,
  password: string
) => {
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
      const res = await supabase.auth.setSession(data?.session);
      console.log(res);
    })
    .catch((err) => {
      console.log(err);
      throw err?.message || err || 'Something went wrong';
    });
};
