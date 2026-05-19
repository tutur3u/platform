import { GradientHeadline } from '@tuturuuu/ui/custom/gradient-headline';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { isAIWhitelistEmailEnabled } from '@/lib/ai-whitelist/email-repository';
import SparkClientPage from './client-page';

export const metadata: Metadata = {
  title: 'Spark',
  description: 'Manage Spark in the AI area of your Tuturuuu workspace.',
};

export default async function SparkPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const t = await getTranslations('common');
  const user = await getCurrentUser();

  if (!user?.email) redirect('/login');
  const whitelisted = await isAIWhitelistEmailEnabled(user.email);

  if (!whitelisted)
    return (
      <div className="flex h-screen w-full items-center justify-center font-bold text-2xl lg:text-4xl xl:text-5xl">
        <GradientHeadline>{t('not_whitelisted')}.</GradientHeadline>
      </div>
    );

  return (
    <WorkspaceWrapper params={params}>
      {({ wsId }) => <SparkClientPage wsId={wsId} />}
    </WorkspaceWrapper>
  );
}
