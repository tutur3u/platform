import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/utils/name-helper';
import { User } from '@/types/primitives/User';
import moment from 'moment';
import useTranslation from 'next-translate/useTranslation';
import { getRoleColor } from '@/utils/color-helper';
import { MemberSettingsButton } from './member-settings-button';
import { Workspace } from '@/types/primitives/Workspace';
import InviteMemberButton from './invite-member-button';
import { User as UserIcon } from 'lucide-react';
import { getCurrentUser } from '@/lib/user-helper';

interface Props {
  workspace: Workspace;
  members: User[];
  invited: boolean;
}

export default async function MemberList({
  workspace,
  members,
  invited,
}: Props) {
  const { t, lang } = useTranslation('ws-members');
  const user = await getCurrentUser();

  if (!members || members.length === 0) {
    return (
      <div className="border-primary/10 bg-primary-foreground/20 col-span-full flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8">
        <p className="text-center text-zinc-500 dark:text-zinc-400">
          {invited ? t('no_invited_members_found') : t('no_members_match')}.
        </p>
        <InviteMemberButton
          wsId={workspace.id}
          currentUser={{
            ...user,
            role: workspace.role,
          }}
          label={t('invite_member')}
          variant="outline"
        />
      </div>
    );
  }

  return members.map((member) => (
    <div
      key={member.id}
      className={`border-primary/10 relative rounded-lg border p-4 ${
        member?.pending
          ? 'bg-primary-foreground/20 border-dashed'
          : 'bg-primary-foreground'
      }`}
    >
      <div className="flex items-center gap-2">
        <Avatar>
          <AvatarImage src={member?.avatar_url ?? undefined} />
          <AvatarFallback className="font-semibold">
            {member?.display_name ? (
              getInitials(member.display_name)
            ) : (
              <UserIcon className="h-5 w-5" />
            )}
          </AvatarFallback>
        </Avatar>

        <div>
          <p className="font-semibold lg:text-lg">
            {member?.display_name ? (
              member.display_name
            ) : (
              <span className="opacity-50">Unknown</span>
            )}{' '}
            {member?.role_title ? (
              <span className="text-orange-300">({member.role_title})</span>
            ) : null}
          </p>
          <p className="text-muted-foreground text-sm font-semibold">
            {member?.handle
              ? `@${member.handle}`
              : member?.email ?? `@${member?.id?.replace(/-/g, '')}`}
          </p>
        </div>
      </div>

      <div className="absolute right-4 top-4 flex gap-2">
        <MemberSettingsButton
          workspace={workspace}
          user={member}
          currentUser={{ ...user, role: workspace.role }}
        />
      </div>

      <div className="mt-2 flex flex-col items-center justify-between gap-2 border-t border-zinc-300 pt-2 dark:border-zinc-800 lg:flex-row lg:gap-4">
        {member?.created_at ? (
          <div className="line-clamp-1 text-zinc-500">
            {t(member?.pending ? 'invited' : 'member_since')}{' '}
            <span className="font-semibold text-zinc-600 dark:text-zinc-400">
              {moment(member.created_at).locale(lang).fromNow()}
            </span>
            .
          </div>
        ) : null}

        <div className="flex gap-2">
          {user?.id === member.id && (
            <div
              className={`w-full rounded border px-2 py-0.5 text-center font-semibold lg:w-fit ${getRoleColor(
                'you'
              )}`}
            >
              You
            </div>
          )}

          <div
            className={`w-full rounded border px-2 py-0.5 text-center font-semibold lg:w-fit ${getRoleColor(
              member?.pending
                ? 'unknown'
                : member?.role?.toLocaleLowerCase() ?? 'unknown'
            )}`}
          >
            {t(member?.role?.toLocaleLowerCase() || 'unknown')}
          </div>
        </div>
      </div>
    </div>
  ));
}
