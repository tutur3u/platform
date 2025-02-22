import InviteMemberButton from './invite-member-button';
import { MemberSettingsButton } from './member-settings-button';
import { getCurrentUser } from '@/lib/user-helper';
import { getInitials } from '@/utils/name-helper';
import { User } from '@tuturuuu/types/primitives/User';
import { Workspace } from '@tuturuuu/types/primitives/Workspace';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { cn } from '@tuturuuu/utils';
import { User as UserIcon } from 'lucide-react';
import moment from 'moment';
import { getLocale, getTranslations } from 'next-intl/server';

interface Props {
  workspace?: Workspace | null;
  members: User[];
  invited?: boolean;
  loading?: boolean;
}

export default async function MemberList({
  workspace,
  members,
  invited,
  loading,
}: Props) {
  const locale = await getLocale();
  const t = await getTranslations('ws-members');
  const user = await getCurrentUser();

  if (!members || members.length === 0) {
    return (
      <div className="col-span-full flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-primary-foreground/20 p-8">
        <p className="text-center text-foreground/80">
          {invited ? t('no_invited_members_found') : t('no_members_match')}.
        </p>

        {!!workspace?.id && (
          <InviteMemberButton
            wsId={workspace?.id}
            currentUser={{
              ...user!,
              role: workspace?.role,
            }}
            label={t('invite_member')}
            variant="outline"
          />
        )}
      </div>
    );
  }

  return members.map((member) => (
    <div
      key={member.id}
      className={`relative rounded-lg border border-border p-4 ${
        member?.pending
          ? 'border-dashed bg-transparent'
          : 'bg-primary-foreground/20'
      }`}
    >
      <div className="flex items-center gap-2">
        <Avatar>
          <AvatarImage src={member?.avatar_url ?? undefined} />
          <AvatarFallback className="font-semibold">
            {!loading && member?.display_name ? (
              getInitials(member.display_name)
            ) : (
              <UserIcon className="h-5 w-5" />
            )}
          </AvatarFallback>
        </Avatar>

        <div className={loading ? 'text-transparent' : ''}>
          <p className="font-semibold lg:text-lg">
            {member?.display_name ? (
              member.display_name
            ) : (
              <span className="opacity-50">Unknown</span>
            )}{' '}
            {member?.role_title ? (
              <span className="text-dynamic-orange">({member.role_title})</span>
            ) : null}
          </p>
          <p
            className={`text-sm font-semibold ${
              loading ? 'text-transparent' : 'text-foreground/60'
            }`}
          >
            {member?.email ||
              (member?.handle
                ? `@${member.handle}`
                : member?.id?.replace(/-/g, ''))}
          </p>
        </div>
      </div>

      {workspace && (
        <div className="absolute top-4 right-4 flex gap-2">
          <MemberSettingsButton
            workspace={workspace}
            user={member}
            currentUser={{ ...user!, role: workspace.role }}
          />
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-sm md:text-base lg:gap-4">
        {loading || member?.created_at ? (
          <div
            className={`line-clamp-1 ${
              loading ? 'text-transparent' : 'text-foreground/80'
            }`}
          >
            <span className="opacity-90">
              {t(member?.pending ? 'invited' : 'member_since')}
            </span>{' '}
            <span className="font-semibold">
              {moment(member.created_at).locale(locale).fromNow()}
            </span>
            .
          </div>
        ) : null}

        <div className="flex gap-2">
          {user?.id === member.id && (
            <div
              className={`rounded border px-2 py-0.5 text-center font-semibold ${
                loading
                  ? 'text-transparent'
                  : 'border-border bg-primary text-primary-foreground'
              }`}
            >
              {t('you')}
            </div>
          )}

          <div
            className={cn(
              `flex-initial rounded border px-2 py-0.5 text-center font-semibold ${
                member?.pending ? 'border-dashed opacity-60' : ''
              }`,
              loading
                ? 'text-transparent'
                : 'border-border bg-foreground/5 text-foreground'
            )}
          >
            {t(
              (member?.role?.toLocaleLowerCase() || 'unknown') as
                | 'member'
                | 'admin'
                | 'owner'
            )}
          </div>
        </div>
      </div>
    </div>
  ));
}
