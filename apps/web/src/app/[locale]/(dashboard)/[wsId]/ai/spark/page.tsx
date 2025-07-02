import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import GradientHeadline from '@/app/[locale]/(marketing)/gradient-headline';
import SparkClientPage from './client-page';

export default async function SparkPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const t = await getTranslations('common');
  const { wsId } = await params;
  const user = await getCurrentUser();
  if (!user?.email) redirect('/login');

  const adminSb = await createAdminClient();

  const { data: whitelisted, error } = await adminSb
    .from('ai_whitelisted_emails')
    .select('enabled')
    .eq('email', user?.email)
    .maybeSingle();

  if (error || !whitelisted?.enabled)
    return (
      <div className="flex h-screen w-full items-center justify-center font-bold text-2xl lg:text-4xl xl:text-5xl">
        <GradientHeadline>{t('not_whitelisted')}.</GradientHeadline>
      </div>
    );

  return <SparkClientPage wsId={wsId} />;
}
