import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import useTranslation from 'next-translate/useTranslation';
import LoadingIndicator from '@/components/common/LoadingIndicator';
import WorkspaceInviteSnippet from '@/components/notifications/WorkspaceInviteSnippet';
import { Separator } from '@/components/ui/separator';
import { getWorkspaceInvites, getWorkspaces } from '@/lib/workspace-helper';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const workspaces = await getWorkspaces();
  if (workspaces?.[0]?.id) redirect(`/${workspaces[0].id}`);

  const workspaceInvites = await getWorkspaceInvites();

  const { t } = useTranslation('onboarding');

  const justAMoment = t('just-a-moment');
  const justAMomentDesc = t('just-a-moment-desc');

  const noInvites = t('no-invites');

  return (
    <div className="inset-0 mx-4 flex min-h-screen items-center justify-center lg:mx-32">
      <div className="flex max-h-full w-full max-w-2xl flex-col items-center gap-4 rounded-xl border p-4 backdrop-blur-2xl md:p-8">
        {!workspaces ? (
          <div className="flex h-full w-full items-center justify-center">
            <LoadingIndicator className="h-8 w-8" />
          </div>
        ) : (
          <>
            <div className="text-center">
              <div className="bg-gradient-to-br from-yellow-200 via-green-200 to-green-300 bg-clip-text py-2 text-4xl font-semibold text-transparent md:text-5xl">
                {justAMoment}
              </div>

              <div className="text-xl font-semibold text-zinc-200">
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
                <div className="flex h-full items-center justify-center px-8 py-16 text-center text-2xl font-semibold text-zinc-300/70">
                  {noInvites}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
