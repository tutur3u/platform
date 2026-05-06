import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { redirect } from 'next/navigation';
import { BASE_URL, WEB_APP_URL } from '@/constants/common';

function normalizeNextPath(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (!rawValue?.startsWith('/') || rawValue.startsWith('//')) return '/';
  return rawValue;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const nextPath = normalizeNextPath(params.next);
  const supabase = await createClient();
  const { user } = await resolveAuthenticatedSessionUser(supabase).catch(
    () => ({ user: null })
  );

  if (user) {
    redirect(nextPath);
  }

  const returnUrl = new URL('/verify-token', BASE_URL);
  returnUrl.searchParams.set('nextUrl', nextPath);

  const loginUrl = new URL('/login', WEB_APP_URL);
  loginUrl.searchParams.set('returnUrl', returnUrl.toString());

  redirect(loginUrl.toString());
}
