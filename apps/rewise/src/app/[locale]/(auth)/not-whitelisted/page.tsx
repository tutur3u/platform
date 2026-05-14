import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

export default async function NotWhitelistedPage() {
  const t = await getTranslations();

  const user = await getSatelliteAppSessionUser('rewise');
  if (!user?.email) redirect('/login');

  const adminSb = await createAdminClient({ noCookie: true });

  const { data: whitelisted, error } = await adminSb
    .from('ai_whitelisted_emails')
    .select('enabled')
    .eq('email', user?.email)
    .maybeSingle();

  if (error || whitelisted?.enabled) redirect('/');

  return (
    <div className="mx-auto flex min-h-screen w-full flex-col items-center justify-center p-4 text-center md:p-8 lg:p-16">
      <h1 className="font-bold text-xl">{t('common.not_whitelisted')}</h1>
      <p className="text-balance opacity-70">
        {t('common.not_whitelisted_desc')}
      </p>
    </div>
  );
}
