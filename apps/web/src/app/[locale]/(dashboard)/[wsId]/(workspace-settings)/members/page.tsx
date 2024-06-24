import InviteMemberButton from './_components/invite-member-button';
import MemberList from './_components/member-list';
import MemberTabs from './_components/member-tabs';
import { getCurrentUser } from '@/lib/user-helper';
import { getWorkspace, verifyHasSecrets } from '@/lib/workspace-helper';
import { User } from '@/types/primitives/User';
import { createAdminClient, createClient } from '@/utils/supabase/server';
import { Separator } from '@repo/ui/components/ui/separator';
import useTranslation from 'next-translate/useTranslation';
import { Suspense } from 'react';

interface Props {
  params: {
    wsId: string;
  };
  searchParams: {
    status: string;
    roles: string;
  };
}

export default async function WorkspaceMembersPage({
  params: { wsId },
  searchParams,
}: Props) {
  const ws = await getWorkspace(wsId);
  const user = await getCurrentUser();
  const members = await getMembers(wsId, searchParams);

  const { t } = useTranslation('ws-members');

  const disableInvite = await verifyHasSecrets(wsId, ['DISABLE_INVITE']);

  return (
    <>
      <div className="border-border bg-foreground/5 flex flex-col justify-between gap-4 rounded-lg border p-4 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-bold">
            {t('workspace-settings-layout:members')}
          </h1>
          <p className="text-foreground/80">{t('description')}</p>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 md:flex-row">
          <Suspense
            fallback={
              <InviteMemberButton
                wsId={wsId}
                currentUser={{
                  id: '',
                  role: 'MEMBER',
                }}
                label={t('invite_member')}
                disabled
              />
            }
          >
            <InviteMemberButton
              wsId={wsId}
              currentUser={{
                ...user!,
                role: ws?.role,
              }}
              label={
                disableInvite ? t('invite_member_disabled') : t('invite_member')
              }
              disabled={disableInvite}
            />
          </Suspense>
          <MemberTabs value={searchParams?.status || 'all'} />
        </div>
      </div>
      <Separator className="my-4" />

      <div className="flex min-h-full w-full flex-col">
        <div className="grid items-end gap-4 lg:grid-cols-2">
          <Suspense
            fallback={
              <MemberList
                members={Array.from({ length: 10 }).map((_, i) => ({
                  id: i.toString(),
                  display_name: 'Unknown',
                  role: 'MEMBER',
                  pending: true,
                }))}
                loading
              />
            }
          >
            <MemberList
              workspace={ws}
              members={members}
              invited={searchParams?.status === 'invited'}
            />
          </Suspense>
        </div>
      </div>
    </>
  );
}

const getMembers = async (
  wsId: string,
  { status, roles }: { status: string; roles: string }
) => {
  const supabase = createClient();
  const sbAdmin = createAdminClient();

  const { data: secretData, error: secretError } = await sbAdmin
    .from('workspace_secrets')
    .select('name')
    .eq('ws_id', wsId)
    .in('name', ['HIDE_MEMBER_EMAIL', 'HIDE_MEMBER_NAME'])
    .eq('value', 'true');

  console.log(secretData);
  if (secretError) throw secretError;

  const queryBuilder = supabase
    .from('workspace_members_and_invites')
    .select(
      'id, handle, email, display_name, avatar_url, pending, role, role_title, created_at',
      {
        count: 'exact',
      }
    )
    .eq('ws_id', wsId)
    .order('pending')
    .order('created_at', { ascending: false })
    .order('id', { ascending: true });

  if (status && status !== 'all')
    queryBuilder.eq('pending', status === 'invited');

  if (roles) queryBuilder.in('role', roles.split(','));

  const { data, error } = await queryBuilder;
  if (error) throw error;

  return data.map(({ email, ...rest }) => {
    return {
      ...rest,
      display_name:
        secretData.filter((secret) => secret.name === 'HIDE_MEMBER_NAME')
          .length === 0
          ? rest.display_name
          : undefined,
      email:
        secretData.filter((secret) => secret.name === 'HIDE_MEMBER_EMAIL')
          .length === 0
          ? email
          : undefined,
    };
  }) as User[];
};
