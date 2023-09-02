import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/utils/name-helper';
import { User } from '@/types/primitives/User';
import { Cog6ToothIcon } from '@heroicons/react/24/solid';
import moment from 'moment';
import useTranslation from 'next-translate/useTranslation';
import { getRoleColor } from '@/utils/color-helper';

interface Props {
  currentRole?: string;
  members: User[];
}

export default async function MemberList({ currentRole: _, members }: Props) {
  const { t, lang } = useTranslation('ws-members');

  // const deleteMember = async (member: User, invited: boolean) => {
  //   if (!member.id) return;

  //   const response = await fetch(
  //     `/api/workspaces/${wsId}/members/${member.id}${
  //       invited ? '?invited=true' : ''
  //     }`,
  //     {
  //       method: 'DELETE',
  //     }
  //   );

  //   if (response.ok) {
  // showNotification({
  //   title: invited ? t('invitation_revoked') : t('member_removed'),
  //   message: invited
  //     ? `${t('invitation_to')} ${
  //         (member?.handle && `@${member?.handle}`) ||
  //         member?.display_name ||
  //         member?.email
  //       } ${t('has_been_revoked')}`
  //     : `${member?.display_name || member?.email} ${t('has_been_removed')}`,
  //   color: 'teal',
  // });
  // if (member.id === user?.id) router.push('/');
  // } else {
  // showNotification({
  //   title: t('error'),
  //   message: invited
  //     ? t('revoke_error')
  //     : `${t('remove_error')} ${member?.display_name || member?.email}`,
  // });
  // }
  // };

  // const updateMember = async (wsId: string, member: User) => {
  //   if (!wsId || !member.id) return;

  //   const response = await fetch(
  //     `/api/workspaces/${wsId}/members/${member.id}`,
  //     {
  //       method: 'PUT',
  //       headers: {
  //         'Content-Type': 'application/json',
  //       },
  //       body: JSON.stringify({
  //         role: member.role,
  //         role_title: member.role_title,
  //       } as User),
  //     }
  //   );

  //   if (response.ok) {
  // showNotification({
  //   title: t('member-updated'),
  //   message: `${member?.display_name || member?.email} ${t(
  //     'has-been-updated'
  //   )}`,
  //   color: 'teal',
  // });
  // } else {
  // showNotification({
  //   title: t('error'),
  //   message: `${t('update-error')} ${
  //     member?.display_name || member?.email
  //   }`,
  // });
  // }
  // };

  // const showEditModal = (member: User) => {
  //   if (!wsId || !currentRole) return;
  //
  // openModal({
  //   title: <div className="font-semibold">{t('member-settings')}</div>,
  //   centered: true,
  //   children: (
  //     <WorkspaceMemberEditForm
  //       currentRole={currentRole as UserRole}
  //       wsId={wsId}
  //       user={member}
  //       onSubmit={async (wsId, user) => await updateMember(wsId, user)}
  //       onDelete={async () => await deleteMember(member, false)}
  //     />
  //   ),
  // });
  // };

  return members.map((member) => (
    <div
      key={member.id}
      className="relative rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900"
    >
      <div className="flex items-center gap-2">
        <Avatar
          color="blue"
          className="aspect-square w-full max-w-[3.5rem] rounded-full text-xl"
        >
          <AvatarImage src={member?.avatar_url ?? undefined} />
          <AvatarFallback>
            {getInitials(member?.display_name || '?')}
          </AvatarFallback>
        </Avatar>

        <div>
          <p className="font-semibold lg:text-lg xl:text-xl">
            {member.display_name}{' '}
            {member?.role_title ? (
              <span className="text-orange-300">({member.role_title})</span>
            ) : null}
          </p>
          <p className="font-semibold text-blue-600 dark:text-blue-300">
            @{member.handle}
          </p>
        </div>
      </div>

      <div className="absolute right-4 top-4 flex gap-2">
        <button
          className="font-semibold text-zinc-400 transition hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-200"
          // onClick={() => showEditModal(member)}
        >
          <Cog6ToothIcon className="h-6 w-6" />
        </button>
      </div>

      <div className="mt-2 flex flex-col items-center justify-between gap-2 border-t border-zinc-300 pt-2 dark:border-zinc-800 lg:flex-row lg:gap-4">
        {member?.created_at ? (
          <div className="line-clamp-1 text-zinc-500">
            {t('member_since')}{' '}
            <span className="font-semibold text-zinc-600 dark:text-zinc-400">
              {moment(member.created_at).locale(lang).fromNow()}
            </span>
            .
          </div>
        ) : null}

        <div
          className={`w-full rounded border px-2 py-0.5 text-center font-semibold lg:w-fit ${getRoleColor(
            member?.role?.toLocaleLowerCase() || 'unknown'
          )}`}
        >
          {t(member?.role?.toLocaleLowerCase() || 'unknown')}
        </div>
      </div>
    </div>
  ));
}
