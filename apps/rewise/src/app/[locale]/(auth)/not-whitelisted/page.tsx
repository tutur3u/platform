import { getCurrentUser } from '@/lib/user-helper';
import { createAdminClient } from '@/utils/supabase/server';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

export default async function NotWhitelistedPage() {
  const t = await getTranslations();

  const user = await getCurrentUser();
  if (!user?.email) redirect('/login');

  const adminSb = await createAdminClient();

  const { data: whitelisted, error } = await adminSb
    .from('ai_whitelisted_emails')
    .select('enabled')
    .eq('email', user?.email)
    .maybeSingle();

  if (error || whitelisted?.enabled) redirect('/');

  return (
    <div className="mx-auto flex min-h-screen w-full flex-col items-center justify-center p-4 text-center md:p-8 lg:p-16">
      <h1 className="text-xl font-bold">{t('common.not_whitelisted')}</h1>
      <p className="text-balance opacity-70">
        {t('common.not_whitelisted_desc')}
      </p>
    </div>
  );
}
