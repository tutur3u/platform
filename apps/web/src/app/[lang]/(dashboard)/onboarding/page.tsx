import { redirect } from 'next/navigation';
import useTranslation from 'next-translate/useTranslation';
import LoadingIndicator from '@/components/common/LoadingIndicator';
import WorkspaceInviteSnippet from '@/components/notifications/WorkspaceInviteSnippet';
import { Separator } from '@/components/ui/separator';
import { getWorkspaceInvites, getWorkspaces } from '@/lib/workspace-helper';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const workspaces = await getWorkspaces();
  if (workspaces?.[0]?.id) redirect(`/${workspaces[0].id}`);

  const workspaceInvites = await getWorkspaceInvites();

  const { t } = useTranslation('onboarding');

  const justAMoment = t('just-a-moment');
  const justAMomentDesc = t('just-a-moment-desc');

  const noInvites = t('no-invites');

  return (
    <div className="inset-0 m-4 mt-32 flex items-center justify-center lg:mx-32">
      <div className="border-foreground/20 flex max-h-full w-full max-w-2xl flex-col items-center gap-4 rounded-xl border p-4 backdrop-blur-2xl md:p-8">
        <Suspense
          fallback={
            <div className="flex h-full w-full items-center justify-center">
              <LoadingIndicator className="h-8 w-8" />
            </div>
          }
        >
          <div className="text-center">
            <div className="bg-gradient-to-br from-yellow-500 via-green-500 to-blue-600 bg-clip-text py-2 text-2xl font-semibold text-transparent dark:from-yellow-500 dark:via-green-200 dark:to-green-300 md:text-3xl lg:text-5xl">
              {justAMoment}
            </div>

            <div className="text-foreground/80 text-lg font-semibold md:text-xl">
              {justAMomentDesc}
            </div>
          </div>

          <Separator />

          <div className="scrollbar-none grid h-full w-full gap-4 overflow-y-auto">
            {workspaceInvites.length ? (
              workspaceInvites.map((ws) => (
                <WorkspaceInviteSnippet key={ws.id} ws={ws} />
              ))
            ) : (
              <div className="text-foreground/60 flex h-full items-center justify-center px-4 py-16 text-center text-lg font-semibold md:text-2xl">
                {noInvites}
              </div>
            )}
          </div>
        </Suspense>
      </div>
    </div>
  );
}
