import { Crown, User as UserIcon } from '@tuturuuu/icons';
import { Masonry } from '@tuturuuu/masonry';
import type { Workspace } from '@tuturuuu/types';
import type { User } from '@tuturuuu/types/primitives/User';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import moment from 'moment';
import { getLocale, getTranslations } from 'next-intl/server';
import InviteMemberButton from './invite-member-button';
import { MemberPermissionBreakdown } from './member-permission-breakdown';
import { MemberSettingsButton } from './member-settings-button';

interface Props {
  workspace?: Workspace | null;
  members: (User & {
    is_creator?: boolean;
    roles?: Array<{
      id: string;
      name: string;
      permissions?: Array<{ permission: string; enabled: boolean }>;
    }>;
    default_permissions?: Array<{ permission: string; enabled: boolean }>;
  })[];
  invited?: boolean;
  loading?: boolean;
  canManageMembers?: boolean;
}

export default async function MemberList({
  workspace,
  members,
  invited,
  loading,
  canManageMembers,
}: Props) {
  const locale = await getLocale();
  const t = await getTranslations('ws-members');
  const user = await getCurrentUser();

  if (!members || members.length === 0) {
    return (
      <div className="col-span-full flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-primary-foreground/20 p-8">
        <p className="text-center text-foreground/80">
          {invited ? t('no_invited_members_found') : t('no_members_match')}.
        </p>

        {!!workspace?.id && (
          <InviteMemberButton
            wsId={workspace?.id}
            currentUser={user!}
            canManageMembers={canManageMembers}
            label={t('invite_member')}
            variant="outline"
          />
        )}
      </div>
    );
  }

  const memberCards = members.map((member) => (
    <div
      key={member.id || member.email}
      className={`relative rounded-lg border p-4 transition-colors ${
        member?.pending
          ? 'border-dashed bg-transparent'
          : 'bg-primary-foreground/20 hover:bg-primary-foreground/30'
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

        <div className={`flex-1 ${loading ? 'text-transparent' : ''}`}>
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-semibold lg:text-lg">
              {member?.display_name ? (
                member.display_name
              ) : (
                <span className="opacity-50">Unknown</span>
              )}
            </p>
            {member.is_creator && (
              <Badge className="h-5 gap-1 border-dynamic-yellow/50 bg-dynamic-yellow/10 px-1.5 text-dynamic-yellow text-xs">
                <Crown className="h-3 w-3" />
                {t('creator_badge')}
              </Badge>
            )}
            {member.roles?.map((role) => (
              <Badge
                key={role.id}
                className="h-5 border-dynamic-purple/50 bg-dynamic-purple/10 px-1.5 text-dynamic-purple text-xs"
              >
                {role.name}
              </Badge>
            ))}
          </div>
          <p
            className={`font-semibold text-sm ${
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
            currentUser={user!}
            canManageMembers={canManageMembers}
          />
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm md:text-base lg:gap-4">
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
                  : 'bg-primary text-primary-foreground'
              }`}
            >
              {t('you')}
            </div>
          )}
        </div>
      </div>

      {/* Permission Breakdown - only show for non-pending members */}
      {!member?.pending && workspace && member.id && (
        <MemberPermissionBreakdown
          wsId={workspace.id}
          member={member as typeof member & { id: string }}
        />
      )}
    </div>
  ));

  return (
    <Masonry
      columns={2}
      gap={16}
      breakpoints={{
        0: 1, // 1 column on mobile
        768: 1, // 1 column on tablet
        1024: 2, // 2 columns on desktop
        1536: 2, // 2 columns on larger screens
      }}
      strategy="count"
    >
      {memberCards}
    </Masonry>
  );
}
