import { NextRouter } from 'next/router';
import { SupabaseClient } from '@supabase/auth-helpers-react';
import { mutate } from 'swr';

export type AuthMethod = 'login' | 'signup';

export interface AuthFormFields {
  email: string;
  password?: string;
  otp?: string;
}

interface AuthProps {
  supabase: SupabaseClient;
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
  supabase,
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
      if (data?.session) await supabase.auth.setSession(data?.session);
    })
    .catch((err) => {
      throw err?.message || err || 'Something went wrong';
    });
};

export const logout = async ({
  supabase,
  router,
}: {
  supabase: SupabaseClient;
  router: NextRouter;
}) => {
  // Sign out from Supabase
  await supabase.auth.signOut();

  const userPromise = mutate('/api/user', null);
  const workspacePromise = mutate('/api/workspaces/current', null);
  const invitesPromise = mutate('/api/workspaces/invites', null);

  // Wait for all mutations to complete
  await Promise.all([userPromise, workspacePromise, invitesPromise]);

  // Redirect to homepage
  router.push('/');
};
