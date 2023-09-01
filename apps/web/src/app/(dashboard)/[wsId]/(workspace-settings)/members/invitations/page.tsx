import { Separator } from '@/components/ui/separator';
import MemberRoleMultiSelector from '@/components/selectors/MemberRoleMultiSelector';
import useTranslation from 'next-translate/useTranslation';
import InviteMemberButton from '../invite-member-button';
import MemberTabs from '../_components/member-tabs';

export const dynamic = 'force-dynamic';

interface Props {
  params: {
    wsId: string;
  };
}

export default async function WorkspaceMembersPage({
  params: { wsId },
}: Props) {
  // const ws = await getWorkspace(wsId);

  const { t } = useTranslation('ws-members');

  const membersLabel = t('workspace-tabs:members');
  const inviteLabel = t('invite_member');

  const joinedLabel = t('joined');
  const invitedLabel = t('invited');

  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-bold">{membersLabel}</h1>
          <p className="text-zinc-700 dark:text-zinc-400">{t('description')}</p>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 md:flex-row">
          <InviteMemberButton wsId={wsId} label={inviteLabel} />
          <MemberTabs
            wsId={wsId}
            joinedLabel={joinedLabel}
            invitedLabel={invitedLabel}
          />
        </div>
      </div>
      <Separator className="my-4" />

      <div className="flex min-h-full w-full flex-col ">
        <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MemberRoleMultiSelector />
        </div>
        <Separator className="mt-4" />
        {/* <PaginationIndicator
          activePage={Number(page)}
          itemsPerPage={Number(itemsPerPage)}
        /> */}

        <div className="grid items-end gap-4 lg:grid-cols-2">
          {/* <MemberList wsId={ws.id} role={ws.role} /> */}
        </div>
      </div>
    </>
  );
}
