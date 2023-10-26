import { Separator } from '@/components/ui/separator';
import MemberRoleMultiSelector from '@/components/selectors/MemberRoleMultiSelector';
import useTranslation from 'next-translate/useTranslation';
import InviteMemberButton from './_components/invite-member-button';
import MemberTabs from './_components/member-tabs';
import MemberList from './_components/member-list';

export default function Loading() {
  const { t } = useTranslation('ws-members');

  const membersLabel = t('workspace-settings-layout:members');
  const inviteLabel = t('invite_member');

  return (
    <>
      <div className="border-foreground/10 bg-foreground/5 flex flex-col justify-between gap-4 rounded-lg border p-4 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-bold">{membersLabel}</h1>
          <p className="text-zinc-700 dark:text-zinc-400">{t('description')}</p>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 md:flex-row">
          <InviteMemberButton label={inviteLabel} />
          <MemberTabs />
        </div>
      </div>
      <Separator className="my-4" />

      <div className="flex min-h-full w-full flex-col">
        <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MemberRoleMultiSelector />
        </div>
        <Separator className="my-4" />

        <div className="grid items-end gap-4 lg:grid-cols-2">
          <MemberList
            members={Array.from({ length: 10 }).map((_, i) => ({
              id: i.toString(),
              display_name: t('common:loading'),
              role: 'MEMBER',
              pending: true,
            }))}
            loading
          />
        </div>
      </div>
    </>
  );
}
