'use client';

import { Link2, Users2 } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import moment from 'moment';
import 'moment/locale/vi';
import { useLocale, useTranslations } from 'next-intl';
import type { InviteLinkDetails } from '@/lib/workspace-invite-links';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inviteLink?: InviteLinkDetails;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

function JoinedUserRow({ inviteLink }: { inviteLink: InviteLinkDetails }) {
  const t = useTranslations();
  const locale = useLocale();

  if (inviteLink.uses.length === 0) {
    return (
      <div className="rounded-2xl border border-foreground/20 border-dashed bg-foreground/[0.02] px-6 py-12 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-linear-to-br from-dynamic-purple/10 to-dynamic-blue/10">
          <Users2 className="h-7 w-7 text-foreground/40" />
        </div>
        <h4 className="mb-2 font-semibold text-base text-foreground">
          {t('ws-invite-links.members-joined')}
        </h4>
        <p className="mx-auto max-w-sm text-foreground/60 text-sm">
          {t('ws-invite-links.no-users-joined')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-semibold text-base text-foreground">
          {t('ws-invite-links.members-joined')}
        </h4>
        <div className="rounded-full bg-dynamic-blue/10 px-3 py-1 font-medium text-dynamic-blue text-xs">
          {inviteLink.uses.length}{' '}
          {inviteLink.uses.length === 1
            ? t('ws-members.member')
            : t('common.members')}
        </div>
      </div>

      <ScrollArea className="h-[360px] rounded-2xl border border-border bg-background">
        <div className="divide-y divide-border">
          {inviteLink.uses.map((inviteUse) => {
            const name =
              inviteUse.user.display_name ||
              inviteUse.user.handle ||
              inviteUse.user.id ||
              t('ws-members.member');

            return (
              <div
                key={inviteUse.id}
                className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-4">
                  <Avatar className="h-11 w-11 ring-2 ring-border ring-offset-2 ring-offset-background">
                    <AvatarImage
                      src={inviteUse.user.avatar_url || undefined}
                      alt={name}
                    />
                    <AvatarFallback className="bg-linear-to-br from-dynamic-blue to-dynamic-purple font-semibold text-background">
                      {name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="space-y-1">
                    <p className="font-medium text-foreground text-sm">
                      {name}
                    </p>
                    {inviteUse.user.handle && inviteUse.user.display_name ? (
                      <p className="text-foreground/60 text-xs">
                        @{inviteUse.user.handle}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="min-w-0 shrink-0 space-y-0.5 text-left sm:text-right">
                  <p className="font-medium text-foreground text-sm">
                    {t('ws-invite-links.joined')}{' '}
                    {moment(inviteUse.joined_at).locale(locale).fromNow()}
                  </p>
                  <p className="text-foreground/50 text-xs">
                    {moment(inviteUse.joined_at).locale(locale).format('lll')}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

export function InviteLinkMembersDialog({
  open,
  onOpenChange,
  inviteLink,
  isLoading,
  isError,
  onRetry,
}: Props) {
  const t = useTranslations();
  const locale = useLocale();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-5xl overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-border border-b bg-linear-to-br from-background via-background to-foreground/[0.03] px-6 py-5">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-dynamic-blue to-dynamic-purple shadow-md">
              <Users2 className="h-5 w-5 text-background" />
            </div>
            {t('ws-invite-links.users-joined-title')}
          </DialogTitle>
          <DialogDescription>
            {t('ws-invite-links.users-joined-description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-6 py-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-foreground/20 border-t-foreground" />
                <p className="text-foreground/60 text-sm">
                  {t('common.loading')}
                </p>
              </div>
            </div>
          ) : isError ? (
            <div className="rounded-2xl border border-dynamic-red/30 border-dashed bg-dynamic-red/5 px-6 py-10 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-dynamic-red/10">
                <Users2 className="h-7 w-7 text-dynamic-red" />
              </div>
              <h4 className="mb-2 font-semibold text-base text-foreground">
                {t('ws-invite-links.fetch-error')}
              </h4>
              <p className="mx-auto max-w-sm text-foreground/60 text-sm">
                {t('ws-invite-links.users-joined-description')}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={onOpenChange.bind(null, false)}
                >
                  {t('common.close')}
                </Button>
                <Button onClick={onRetry}>{t('common.retry')}</Button>
              </div>
            </div>
          ) : inviteLink ? (
            <div className="space-y-10">
              <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex min-h-30 flex-col rounded-2xl border border-border bg-foreground/[0.02] p-4">
                  <p className="shrink-0 text-foreground/60 text-xs uppercase tracking-[0.18em]">
                    {t('ws-invite-links.link-code')}
                  </p>
                  <div className="mt-3 flex min-h-0 flex-1 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-dynamic-blue/10">
                      <Link2 className="h-4 w-4 text-dynamic-blue" />
                    </div>
                    <div className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-foreground/[0.04] px-2.5 py-2">
                      <code className="block whitespace-nowrap font-medium font-mono text-foreground text-sm">
                        {inviteLink.code}
                      </code>
                    </div>
                  </div>
                </div>

                <div className="flex min-h-30 flex-col rounded-2xl border border-border bg-foreground/[0.02] p-4">
                  <p className="text-foreground/60 text-xs uppercase tracking-[0.18em]">
                    {t('ws-invite-links.total-uses')}
                  </p>
                  <div className="mt-3 flex flex-1 flex-col justify-end">
                    <p className="font-semibold text-foreground text-lg leading-tight">
                      {inviteLink.current_uses}
                      {inviteLink.max_uses ? ` / ${inviteLink.max_uses}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex min-h-30 flex-col rounded-2xl border border-border bg-foreground/[0.02] p-4">
                  <p className="text-foreground/60 text-xs uppercase tracking-[0.18em]">
                    {t('ws-invite-links.created-at')}
                  </p>
                  <div className="mt-3 flex flex-1 flex-col justify-end gap-0.5">
                    <p className="font-semibold text-foreground text-sm leading-snug">
                      {moment(inviteLink.created_at)
                        .locale(locale)
                        .format('ll')}
                    </p>
                    <p className="text-foreground/50 text-xs">
                      {moment(inviteLink.created_at).locale(locale).fromNow()}
                    </p>
                  </div>
                </div>

                <div className="flex min-h-30 flex-col rounded-2xl border border-border bg-foreground/[0.02] p-4">
                  <p className="text-foreground/60 text-xs uppercase tracking-[0.18em]">
                    {t('ws-members.invite_membership_label')}
                  </p>
                  <div className="mt-3 flex flex-1 flex-col justify-end gap-0.5">
                    <p className="font-semibold text-foreground text-sm leading-snug">
                      {inviteLink.memberType === 'GUEST'
                        ? t('ws-invite-links.membership-short-guest')
                        : t('ws-invite-links.membership-short-member')}
                    </p>
                    <p className="text-pretty text-foreground/50 text-xs leading-snug">
                      {inviteLink.memberType === 'GUEST'
                        ? t('ws-members.invite_membership_guest')
                        : t('ws-members.invite_membership_member')}
                    </p>
                  </div>
                </div>
              </div>

              <JoinedUserRow inviteLink={inviteLink} />
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
