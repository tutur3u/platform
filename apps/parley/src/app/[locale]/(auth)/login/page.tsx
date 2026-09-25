import { normalizeAuthRedirectPath } from '@tuturuuu/auth/proxy';
import { BASE_URL, TTR_URL } from '@tuturuuu/meet-core/constants/common';
import { getSatelliteSupabaseSessionUser } from '@tuturuuu/satellite/auth';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; nextUrl?: string }>;
}) {
  await connection();
  const params = await searchParams;
  const next = normalizeAuthRedirectPath(
    params.next ?? params.nextUrl,
    BASE_URL,
    '/'
  );
  if ((await getSatelliteSupabaseSessionUser())?.id) redirect(next);
  const login = new URL('/login', TTR_URL);
  login.searchParams.set('returnUrl', new URL(next, BASE_URL).toString());
  redirect(login.toString());
}
