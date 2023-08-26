import {
  SupabaseClient,
  createServerComponentClient,
} from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import useTranslation from 'next-translate/useTranslation';
import LoadingIndicator from '@/components/common/LoadingIndicator';
import WorkspaceInviteSnippet from '@/components/notifications/WorkspaceInviteSnippet';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Workspace } from '@/types/primitives/Workspace';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const workspaces = await getWorkspaces({
    supabase,
    userId: user.id,
  });

  if (workspaces?.[0]?.id) redirect(`/${workspaces[0].id}`);

  const workspaceInvites = await getWorkspaceInvites({
    supabase,
    userId: user.id,
  });

  const { t } = useTranslation('onboarding');

  const justAMoment = t('just-a-moment');
  const justAMomentDesc = t('just-a-moment-desc');

  const noInvites = t('no-invites');
  const logoutLabel = t('common:logout');

  return (
    <div className="absolute inset-0 mx-4 flex items-center justify-center md:mx-4 lg:mx-32">
      <div className="flex max-h-full w-full max-w-2xl flex-col items-center gap-4 rounded-xl p-4 backdrop-blur-2xl md:p-8">
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

            <Separator className="w-full border-zinc-300/20" />

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

            <Separator className="w-full border-zinc-300/20" />
            <div className="grid w-full gap-2">
              <form action="/api/auth/logout" method="post">
                <Button className="w-full border border-red-300/10 bg-red-300/10 text-red-300 hover:bg-red-300/20">
                  {logoutLabel}
                </Button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

async function getWorkspaces({
  supabase,
  userId,
}: {
  supabase: SupabaseClient;
  userId: string;
}) {
  const {
    data,
  }: {
    data: unknown;
  } = await supabase
    .from('workspace_members')
    .select('id:ws_id, role, ...workspaces(name, preset)')
    .eq('user_id', userId)
    .order('sort_key')
    .order('created_at', { ascending: false });

  return data as Workspace[];
}

async function getWorkspaceInvites({
  supabase,
  userId,
}: {
  supabase: SupabaseClient;
  userId: string;
}) {
  const {
    data,
  }: {
    data: unknown;
  } = await supabase
    .from('workspace_invites')
    .select('id:ws_id, ...workspaces(name, preset)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return data as Workspace[];
}
