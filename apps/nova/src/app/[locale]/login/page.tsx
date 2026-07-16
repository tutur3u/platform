import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BASE_URL, TTR_URL } from '@/constants/common';

export const metadata: Metadata = {
  robots: NO_INDEX_ROBOTS,
};

function normalizeNextPath(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (!rawValue?.startsWith('/') || rawValue.startsWith('//')) return '/home';
  return rawValue;
}

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const returnUrl = new URL('/verify-token', BASE_URL);
  returnUrl.searchParams.set(
    'nextUrl',
    normalizeNextPath(params.nextUrl ?? params.next)
  );

  const loginUrl = new URL('/login', TTR_URL);
  loginUrl.searchParams.set('returnUrl', returnUrl.toString());
  loginUrl.searchParams.set('provider', 'nova');

  redirect(loginUrl.toString());
}
