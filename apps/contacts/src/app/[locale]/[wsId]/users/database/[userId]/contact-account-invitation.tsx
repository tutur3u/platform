'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  buildContactLinkInvitationUrl,
  type ContactAccountInvitationState,
  inviteContactAccountHolder,
  listContactAccountChoices,
  readContactAccountInvitation,
  revokeContactAccountInvitation,
} from './contact-account-invitation-api';
import { ContactAccountPicker, accountLabel } from './contact-account-picker';

const stateVariant: Record<
  ContactAccountInvitationState,
  'success' | 'warning' | 'error' | 'secondary'
> = {
  pending: 'warning',
  accepted: 'success',
  declined: 'error',
  expired: 'secondary',
  cancelled: 'secondary',
  ineligible: 'error',
};

export function ContactAccountInvitationCard({
  contactId,
  isLinked,
  webAppUrl,
  workspaceId,
}: {
  contactId: string;
  isLinked: boolean;
  webAppUrl: string;
  workspaceId: string;
}) {
  const t = useTranslations('contact-account-link');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const statusKey = ['contact-account-invitation', workspaceId, contactId];
  const status = useQuery({
    queryKey: statusKey,
    queryFn: () => readContactAccountInvitation(workspaceId, contactId),
  });
  const invitation = status.data ?? null;
  const accounts = useQuery({
    queryKey: ['contact-account-choices', workspaceId],
    queryFn: () => listContactAccountChoices(workspaceId),
    enabled: Boolean(invitation?.accountId),
    staleTime: 60_000,
  });
  const invitedAccount = accounts.data?.find(
    (account) => account.id === invitation?.accountId
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: statusKey });
  const invite = useMutation({
    mutationFn: (accountId: string) =>
      inviteContactAccountHolder(workspaceId, contactId, accountId),
    onSuccess: async () => {
      setPickerOpen(false);
      toast.success(t('invited'));
      await refresh();
    },
    onError: () => toast.error(t('unavailable')),
  });
  const revoke = useMutation({
    mutationFn: () => revokeContactAccountInvitation(workspaceId, contactId),
    onSuccess: async () => {
      setRevokeOpen(false);
      await refresh();
    },
    onError: () => toast.error(t('unavailable')),
  });

  if (isLinked && invitation?.state !== 'accepted') return null;

  const link =
    invitation?.state === 'pending' && invitation.invitationId
      ? buildContactLinkInvitationUrl({
          contactId,
          invitationId: invitation.invitationId,
          webAppUrl,
          wsId: workspaceId,
        })
      : null;
  const formatDate = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t('copied'));
    } catch {
      toast.error(t('copy_failed'));
    }
  };
  const busy = invite.isPending || revoke.isPending;

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">{t('title')}</h2>
        {invitation ? (
          <Badge variant={stateVariant[invitation.state]}>
            {t(`states.${invitation.state}`)}
          </Badge>
        ) : null}
      </div>

      {status.isPending ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : status.isError ? (
        <div className="flex items-center gap-2">
          <p className="text-muted-foreground text-sm">{t('load_failed')}</p>
          <Button variant="outline" size="sm" onClick={() => status.refetch()}>
            {t('retry')}
          </Button>
        </div>
      ) : invitation ? (
        <div className="space-y-1 text-muted-foreground text-sm">
          {invitation.accountId ? (
            <p>
              {t('invited_account', {
                name: invitedAccount
                  ? accountLabel(invitedAccount)
                  : t('unknown_account'),
              })}
            </p>
          ) : null}
          <p>
            {invitation.state === 'pending' && invitation.expiresAt
              ? t('expires_at', { date: formatDate(invitation.expiresAt) })
              : t('updated_at', { date: formatDate(invitation.updatedAt) })}
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t('none_sent')}</p>
      )}

      {link ? (
        <div className="space-y-2">
          <p className="text-sm">{t('share_instructions')}</p>
          <div className="flex gap-2">
            <Input readOnly value={link} aria-label={t('link_label')} />
            <Button variant="outline" onClick={copy}>
              {t('copy')}
            </Button>
          </div>
        </div>
      ) : null}

      {!isLinked && !status.isPending && !status.isError ? (
        <div className="flex flex-wrap gap-2">
          {invitation?.accountId && invitation.state !== 'ineligible' ? (
            <Button
              variant={link ? 'outline' : 'default'}
              disabled={busy}
              onClick={() =>
                invitation.accountId && invite.mutate(invitation.accountId)
              }
            >
              {t('resend')}
            </Button>
          ) : null}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setPickerOpen(true)}
          >
            {invitation ? t('invite_another') : t('invite')}
          </Button>
          {link ? (
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => setRevokeOpen(true)}
            >
              {t('revoke')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <ContactAccountPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onInvite={(accountId) => invite.mutate(accountId)}
        pending={invite.isPending}
        workspaceId={workspaceId}
      />
      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('revoke')}</DialogTitle>
            <DialogDescription>{t('revoke_confirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevokeOpen(false)}>
              {t('keep')}
            </Button>
            <Button
              variant="destructive"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate()}
            >
              {t('revoke')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
