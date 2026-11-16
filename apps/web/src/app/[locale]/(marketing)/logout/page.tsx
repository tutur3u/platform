import { createClient } from '@tuturuuu/supabase/next/server';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { resolveLogoutTarget } from '@tuturuuu/utils/logout-target';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { BASE_URL } from '@/constants/common';
import { LogoutChoices } from './logout-choices';

export default async function LogoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ appUrl?: string }>;
}) {
  await connection();
  const supabase = await createClient();
  const { locale } = await params;
  const { user } = await resolveAuthenticatedSessionUser(supabase);
  const { appUrl } = await searchParams;
  const target = resolveLogoutTarget({ appUrl, centralOrigin: BASE_URL });
  if (!user && !target) redirect(locale === 'vi' ? '/vi/login' : '/login');
  return (
    <LogoutChoices
      target={target}
      email={user?.email ?? null}
      locale={locale}
      canLogoutBrowser={Boolean(user)}
    />
  );
}
