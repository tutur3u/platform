import { Button, Divider } from '@mantine/core';
import { useEffect } from 'react';
import LoadingIndicator from '../common/LoadingIndicator';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useRouter } from 'next/router';
import WorkspaceInviteSnippet from '../notifications/WorkspaceInviteSnippet';
import { useUser } from '../../hooks/useUser';
import useTranslation from 'next-translate/useTranslation';
import LanguageSelector from '../selectors/LanguageSelector';
import { mutate } from 'swr';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { logout } from '../../utils/auth-handler';

interface Props {
  forceLoading?: boolean;
}

const OnboardingForm = ({ forceLoading = false }: Props) => {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const { nextUrl, withWorkspace } = router.query;

  const { user } = useUser();
  const { workspaces, workspaceInvites } = useWorkspaces();

  useEffect(() => {
    if (nextUrl && !withWorkspace && withWorkspace !== 'true') {
      router.push(nextUrl.toString());
      return;
    }

    if (!user) {
      mutate('/api/user');
      return;
    }

    if (!workspaces) {
      mutate('/api/workspaces/current');
      mutate('/api/workspaces/invites');
      return;
    }

    const hasWorkspaces = workspaces.length > 0;
    if (!hasWorkspaces || !workspaces?.[0]?.id) return;

    const url =
      withWorkspace !== 'true' && nextUrl
        ? nextUrl.toString() || '/'
        : `/${workspaces[0].id}/` + (nextUrl || '');

    if (url) router.push(url);
    return;
  }, [router, user, workspaces, nextUrl, withWorkspace]);

  const { t } = useTranslation('onboarding');

  const justAMoment = t('just-a-moment');
  const justAMomentDesc = t('just-a-moment-desc');

  const noInvites = t('no-invites');
  const logoutLabel = t('common:logout');

  return (
    <>
      <div className="absolute inset-0 mx-4 flex items-center justify-center md:mx-4 lg:mx-32">
        <div className="flex max-h-full w-full max-w-2xl flex-col items-center gap-4 rounded-xl bg-zinc-700/50 p-4 backdrop-blur-2xl md:p-8">
          {forceLoading || !user || !workspaces || workspaces.length > 0 ? (
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

              <Divider className="w-full border-zinc-300/20" />

              <div className="scrollbar-none grid h-full w-full gap-4 overflow-y-scroll">
                {(workspaceInvites?.length || 0) > 0 ? (
                  workspaceInvites?.map((ws) => (
                    <WorkspaceInviteSnippet key={ws.id} ws={ws} />
                  ))
                ) : (
                  <div className="flex h-full items-center justify-center px-8 py-16 text-center text-2xl font-semibold text-zinc-300/70">
                    {noInvites}
                  </div>
                )}
              </div>

              <Divider className="w-full border-zinc-300/20" />
              <div className="grid w-full gap-2">
                <LanguageSelector transparent fullWidth />
                <Button
                  className="w-full border border-red-300/10 bg-red-300/10 text-red-300 hover:bg-red-300/20"
                  variant="light"
                  color="red"
                  onClick={(e) => {
                    e.preventDefault();
                    logout({ supabase, router });
                  }}
                >
                  {logoutLabel}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default OnboardingForm;
