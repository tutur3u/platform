'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Loader2 } from '@tuturuuu/icons';
import {
  blacklistMailFailedRecipient,
  getMailBlacklistRecipients,
  type MailBlacklistReason,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { MailBlacklistStatus } from './mail-blacklist-status';
import { MailEmailText } from './mail-email-text';
import { MailIconButton } from './mail-icon-button';

const reasons: MailBlacklistReason[] = [
  'inactive',
  'verification_failed',
  'spam',
  'policy_violation',
  'fraud',
];

export function MailBlacklistControl({
  workspaceId,
  mailboxId,
  messageId,
  compact = false,
}: {
  workspaceId: string;
  mailboxId: string;
  messageId: string;
  compact?: boolean;
}) {
  const t = useTranslations('mail');
  const locale = useLocale();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [reason, setReason] = useState<MailBlacklistReason>('inactive');
  const query = useQuery({
    queryKey: ['mail', workspaceId, mailboxId, 'blacklist', messageId],
    queryFn: () =>
      getMailBlacklistRecipients(workspaceId, mailboxId, messageId),
    staleTime: 60_000,
  });
  const recipients = query.data?.recipients ?? [];
  const email =
    recipients.find((item) => item.email === selected)?.email ??
    recipients[0]?.email ??
    '';
  const blocked =
    recipients.find((item) => item.email === email)?.blocked ?? false;
  const mutation = useMutation({
    mutationFn: (target: {
      workspaceId: string;
      mailboxId: string;
      messageId: string;
      email: string;
      reason: MailBlacklistReason;
    }) =>
      blacklistMailFailedRecipient(
        target.workspaceId,
        target.mailboxId,
        target.messageId,
        { email: target.email, reason: target.reason }
      ),
    onSuccess: (result, target) => {
      client.setQueriesData<
        Awaited<ReturnType<typeof getMailBlacklistRecipients>>
      >(
        {
          queryKey: ['mail', target.workspaceId],
          predicate: (query) => query.queryKey[3] === 'blacklist',
        },
        (current) =>
          current && {
            ...current,
            recipients: current.recipients.map((item) =>
              item.email.toLowerCase() === target.email.toLowerCase()
                ? {
                    ...item,
                    blocked: true,
                    reason: result.alreadyBlocked ? item.reason : target.reason,
                  }
                : item
            ),
          }
      );
      void client.invalidateQueries({
        queryKey: ['mail', target.workspaceId, target.mailboxId, 'blacklist'],
      });
      toast.success(t('blacklist_added', { email: target.email }));
      setOpen(false);
    },
    onError: () => toast.error(t('blacklist_failed')),
  });
  if (!query.data?.canManage || !recipients.length) return null;
  return (
    <div
      className={
        compact
          ? 'flex min-w-0 flex-wrap items-center justify-end gap-2'
          : 'flex min-w-0 flex-wrap items-center gap-2 border-dynamic border-t px-4 py-2 text-xs'
      }
    >
      {!compact ? (
        <>
          <span className="shrink-0 text-muted-foreground">
            {t('failed_recipient')}
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
            {recipients.map((item) => (
              <div
                key={item.email}
                className="flex min-w-0 flex-wrap items-center gap-2"
              >
                <span className="break-all">
                  <MailEmailText text={item.email} />
                </span>
                <MailBlacklistStatus recipients={[item]} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <MailBlacklistStatus recipients={recipients} compact />
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <MailIconButton aria-label={t('blacklist_email')} className="size-7">
            <Ban className="size-3.5" />
          </MailIconButton>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[min(20rem,calc(100vw-2rem))] space-y-3 p-3"
        >
          <div>
            <h3 className="font-medium text-sm">{t('blacklist_email')}</h3>
            <p className="mt-1 text-muted-foreground text-xs">
              {t('blacklist_scope')}
            </p>
          </div>
          <Select
            value={email}
            onValueChange={setSelected}
            disabled={mutation.isPending}
          >
            <SelectTrigger
              aria-label={t('failed_recipient')}
              className="h-8 w-full text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {recipients.map((item) => (
                <SelectItem key={item.email} value={item.email}>
                  {item.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {blocked ? (
            <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Check className="size-3.5" />
              {t('already_blacklisted')}
            </p>
          ) : (
            <>
              <Select
                value={reason}
                onValueChange={(value) =>
                  setReason(value as MailBlacklistReason)
                }
                disabled={mutation.isPending}
              >
                <SelectTrigger
                  aria-label={t('blacklist_reason')}
                  className="h-8 w-full text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {reasons.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`blacklist_reason_${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="h-8 w-full text-xs"
                disabled={mutation.isPending || !email}
                onClick={() =>
                  mutation.mutate({
                    workspaceId,
                    mailboxId,
                    messageId,
                    email,
                    reason,
                  })
                }
              >
                {mutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Ban className="size-3.5" />
                )}
                {t('add_to_blacklist')}
              </Button>
            </>
          )}
          <a
            href={`${query.data.infrastructureOrigin}/${locale}/${ROOT_WORKSPACE_ID}/email-blacklist`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-muted-foreground text-xs underline-offset-4 hover:underline"
          >
            {t('open_blacklist')}
          </a>
        </PopoverContent>
      </Popover>
    </div>
  );
}
