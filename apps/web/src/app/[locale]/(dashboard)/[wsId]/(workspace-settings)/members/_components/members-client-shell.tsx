'use client';

import type { Workspace } from '@tuturuuu/types';
import type { User } from '@tuturuuu/types/primitives/User';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useTranslations } from 'next-intl';
import InviteLinksSection from './invite-links-section';
import InviteMemberButton from './invite-member-button';
import MemberList from './member-list';
import MemberTabs from './member-tabs';
import { memberStatusValues, useWorkspaceMembers } from './members-queries';

interface Props {
  workspace: Workspace;
  wsId: string;
  currentUser?: User | null;
  canManageMembers: boolean;
  disableInvite: boolean;
}

export default function MembersClientShell({
  workspace,
  wsId,
  currentUser,
  canManageMembers,
  disableInvite,
}: Props) {
  const t = useTranslations();
  const [status] = useQueryState(
    'status',
    parseAsStringLiteral(memberStatusValues)
      .withDefault('all')
      .withOptions({ shallow: true })
  );

  const { data, isPending, isError } = useWorkspaceMembers(wsId, status);

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-xl border border-border bg-linear-to-br from-background via-background to-foreground/2 p-6 shadow-sm">
        <div className="pointer-events-none absolute -top-4 -right-4 h-32 w-32 rounded-full bg-dynamic-blue/5 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-4 -left-4 h-32 w-32 rounded-full bg-dynamic-purple/5 blur-2xl" />

        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-dynamic-blue to-dynamic-purple shadow-lg">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6 text-background"
                >
                  <title>{t('workspace-settings-layout.members')}</title>
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h1 className="bg-linear-to-br from-foreground to-foreground/70 bg-clip-text font-bold text-3xl text-transparent">
                {t('workspace-settings-layout.members')}
              </h1>
            </div>
            <p className="ml-15 max-w-2xl text-foreground/70 text-lg leading-relaxed">
              {t('ws-members.description')}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-3 md:flex-row md:items-center">
            <MemberTabs value={status} />
            <InviteMemberButton
              wsId={wsId}
              currentUser={currentUser ?? undefined}
              canManageMembers={canManageMembers}
              label={
                disableInvite
                  ? t('ws-members.invite_member_disabled')
                  : t('ws-members.invite_member')
              }
              disabled={disableInvite}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
        {isError ? (
          <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-6 text-dynamic-red text-sm">
            {t('common.error')}
          </div>
        ) : (
          <MemberList
            workspace={workspace}
            members={data ?? []}
            invited={status === 'invited'}
            loading={isPending}
            canManageMembers={canManageMembers}
            currentUser={currentUser}
          />
        )}
      </div>

      <InviteLinksSection wsId={wsId} canManageMembers={canManageMembers} />
    </div>
  );
}
