import WorkspaceInvites from './workspace-invites';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { Separator } from '@tuturuuu/ui/separator';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

export default async function OnboardingPage() {
  const t = await getTranslations('onboarding');

  return (
    <div className="inset-0 flex h-screen items-center justify-center overflow-scroll p-4 lg:px-32">
      <div className="border-foreground/20 flex max-h-full w-full max-w-2xl flex-col items-center gap-4 rounded-xl border p-4 backdrop-blur-2xl md:p-8">
        <Suspense
          fallback={
            <div className="flex h-full w-full items-center justify-center">
              <LoadingIndicator className="h-8 w-8" />
            </div>
          }
        >
          <div className="text-center">
            <div className="bg-gradient-to-br from-yellow-500 via-green-500 to-blue-600 bg-clip-text py-2 text-2xl font-semibold text-transparent md:text-3xl lg:text-5xl dark:from-yellow-500 dark:via-green-200 dark:to-green-300">
              {t('just-a-moment')}
            </div>

            <div className="text-foreground/80 text-lg font-semibold md:text-xl">
              {t('just-a-moment-desc')}
            </div>
          </div>

          <Separator />
          <WorkspaceInvites />
        </Suspense>
      </div>
    </div>
  );
}
