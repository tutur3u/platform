import SparkClientPage from './client-page';
import GradientHeadline from '@/app/[locale]/(marketing)/gradient-headline';
import { getCurrentUser } from '@/lib/user-helper';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

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
      <div className="flex h-screen w-full items-center justify-center text-2xl font-bold lg:text-4xl xl:text-5xl">
        <GradientHeadline>{t('not_whitelisted')}.</GradientHeadline>
      </div>
    );

  return <SparkClientPage wsId={wsId} />;
}
