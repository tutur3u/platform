import { normalizeAuthRedirectPath } from '@tuturuuu/auth/proxy';
import { BASE_URL } from '@tuturuuu/meet-core/constants/common';
import { getSatelliteSupabaseSessionUser } from '@tuturuuu/satellite/auth';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

/** Legacy return URL: trust the shared provider session, never a URL token. */
export default async function VerifyReturn({
  searchParams,
}: {
  searchParams: Promise<{ nextUrl?: string }>;
}) {
  await connection();
  const next = normalizeAuthRedirectPath(
    (await searchParams).nextUrl,
    BASE_URL,
    '/'
  );
  if ((await getSatelliteSupabaseSessionUser())?.id) redirect(next);
  redirect(`/login?next=${encodeURIComponent(next)}`);
}
