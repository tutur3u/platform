import BackToHomeButton from './back-to-home-button';
import LogOutButton from './log-out-button';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

export default async function NotWhitelistedPage() {
  const t = await getTranslations();
  const user = await getCurrentUser();

  if (!user?.id) redirect('/login');
  const sbAdmin = await createAdminClient();

  const { data } = await sbAdmin
    .from('platform_user_roles')
    .select('enabled')
    .eq('user_id', user?.id)
    .maybeSingle();

  if (data?.enabled) redirect('/home');

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
