import BackToHomeButton from './back-to-home-button';
import LogOutButton from './log-out-button';
import { getCurrentUser } from '@/lib/user-helper';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

export default async function NotWhitelistedPage() {
  const t = await getTranslations();
  const user = await getCurrentUser();

  if (!user?.email) redirect('/login');
  const sbAdmin = await createAdminClient();

  const { data } = await sbAdmin
    .from('nova_roles')
    .select('enabled')
    .eq('email', user?.email)
    .maybeSingle();

  if (data?.enabled) redirect('/dashboard');

  return (
    <div className="mx-auto flex min-h-screen w-full flex-col items-center justify-center p-4 text-center md:p-8 lg:p-16">
      <h1 className="text-xl font-bold">{t('common.not_whitelisted')}</h1>
      <p className="mb-4 text-balance opacity-70">
        Your account is not whitelisted. Please register to proceed.
      </p>

      <div className="flex w-full flex-col gap-2 md:w-fit md:flex-row">
        <BackToHomeButton />
        <LogOutButton />
      </div>
    </div>
  );
}
