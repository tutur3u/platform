'use client';

import {
  Ban,
  CheckCircle2,
  Ellipsis,
  HardDrive,
  KeyRound,
  Loader2,
  Pencil,
} from '@tuturuuu/icons';
import type {
  InternalAccount,
  InternalAccountAction,
  UpdateInternalAccountPayload,
} from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { formatBytes } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { InternalAccountActionDialog } from './internal-account-action-dialog';
import { InternalAccountEditDialog } from './internal-account-edit-dialog';

interface InternalAccountRowProps {
  account: InternalAccount;
  isWorking: boolean;
  onConfirm: (payload: UpdateInternalAccountPayload) => Promise<unknown>;
}

export function InternalAccountRow({
  account,
  isWorking,
  onConfirm,
}: InternalAccountRowProps) {
  const locale = useLocale();
  const t = useTranslations('internal-accounts');
  const [action, setAction] = useState<Exclude<
    InternalAccountAction,
    'update_profile'
  > | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const storagePercentage = account.storageLimitBytes
    ? Math.min(
        100,
        ((account.storageUsedBytes ?? 0) / account.storageLimitBytes) * 100
      )
    : null;

  const formatDate = (value: string | null) =>
    value ? dateFormatter.format(new Date(value)) : t('dates.never');

  return (
    <div
      className="grid gap-4 p-4 transition-colors hover:bg-foreground/[0.025] xl:grid-cols-[minmax(0,1fr)_minmax(15rem,0.45fr)_auto] xl:items-center"
      data-testid={`internal-account-${account.email}`}
    >
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold">
            {account.displayName || account.email}
          </p>
          <Badge variant={account.isDisabled ? 'destructive' : 'secondary'}>
            {account.isDisabled ? t('status.disabled') : t('status.active')}
          </Badge>
          {account.isSelf ? (
            <Badge variant="outline">{t('status.you')}</Badge>
          ) : null}
          {!account.emailConfirmedAt ? (
            <Badge variant="outline">{t('status.unconfirmed')}</Badge>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-sm">
          <span className="truncate">{account.email}</span>
          {account.username ? <span>@{account.username}</span> : null}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-muted-foreground text-xs">
          <span>
            {t('dates.last_sign_in', {
              date: formatDate(account.lastSignInAt),
            })}
          </span>
          <span>
            {t('dates.created', { date: formatDate(account.createdAt) })}
          </span>
        </div>
      </div>

      <div className="min-w-0 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-medium text-xs">
            <HardDrive className="size-4 text-muted-foreground" />
            {t('storage.title')}
          </span>
          <span className="text-muted-foreground text-xs">
            {account.storageUsedBytes !== null &&
            account.storageLimitBytes !== null
              ? t('storage.value', {
                  limit: formatBytes(account.storageLimitBytes, {
                    decimals: 1,
                  }),
                  used: formatBytes(account.storageUsedBytes, { decimals: 1 }),
                })
              : t('storage.unavailable')}
          </span>
        </div>
        {storagePercentage !== null ? (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${storagePercentage}%` }}
            />
          </div>
        ) : null}
      </div>

      <div className="flex xl:justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t('actions.open_menu')}
              disabled={isWorking}
              size="icon"
              type="button"
              variant="outline"
            >
              {isWorking ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Ellipsis className="size-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              {t('actions.edit_profile')}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid={`reset-password-${account.email}`}
              disabled={account.isSelf}
              onSelect={() => setAction('reset_password')}
            >
              <KeyRound className="size-4" />
              {t('actions.reset_password')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {account.isDisabled ? (
              <DropdownMenuItem
                data-testid={`enable-access-${account.email}`}
                disabled={account.isSelf}
                onSelect={() => setAction('enable_access')}
              >
                <CheckCircle2 className="size-4" />
                {t('actions.enable_access')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                data-testid={`disable-access-${account.email}`}
                disabled={account.isSelf}
                onSelect={() => setAction('disable_access')}
              >
                <Ban className="size-4" />
                {t('actions.disable_access')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <InternalAccountActionDialog
        account={account}
        action={action}
        onConfirm={onConfirm}
        onOpenChange={(open) => !open && setAction(null)}
        open={action !== null}
      />
      <InternalAccountEditDialog
        account={account}
        onConfirm={onConfirm}
        onOpenChange={setEditOpen}
        open={editOpen}
      />
    </div>
  );
}
