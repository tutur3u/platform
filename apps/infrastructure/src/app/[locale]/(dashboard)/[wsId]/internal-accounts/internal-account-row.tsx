'use client';

import { Ban, CheckCircle2, KeyRound, Loader2 } from '@tuturuuu/icons';
import type {
  InternalAccount,
  InternalAccountAction,
  UpdateInternalAccountPayload,
} from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { InternalAccountActionDialog } from './internal-account-action-dialog';

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
  const [action, setAction] = useState<InternalAccountAction | null>(null);
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const formatDate = (value: string | null) =>
    value ? dateFormatter.format(new Date(value)) : t('dates.never');

  return (
    <div
      className="flex flex-col gap-4 p-4 transition-colors hover:bg-foreground/[0.025] lg:flex-row lg:items-center"
      data-testid={`internal-account-${account.email}`}
    >
      <div className="min-w-0 flex-1 space-y-2">
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
        {account.displayName ? (
          <p className="truncate text-muted-foreground text-sm">
            {account.email}
          </p>
        ) : null}
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

      <div className="flex flex-wrap gap-2 lg:justify-end">
        <Button
          data-testid={`reset-password-${account.email}`}
          disabled={account.isSelf || isWorking}
          onClick={() => setAction('reset_password')}
          size="sm"
          type="button"
          variant="outline"
        >
          {isWorking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
          {t('actions.reset_password')}
        </Button>
        {account.isDisabled ? (
          <Button
            data-testid={`enable-access-${account.email}`}
            disabled={account.isSelf || isWorking}
            onClick={() => setAction('enable_access')}
            size="sm"
            type="button"
            variant="secondary"
          >
            <CheckCircle2 className="h-4 w-4" />
            {t('actions.enable_access')}
          </Button>
        ) : (
          <Button
            data-testid={`disable-access-${account.email}`}
            disabled={account.isSelf || isWorking}
            onClick={() => setAction('disable_access')}
            size="sm"
            type="button"
            variant="destructive"
          >
            <Ban className="h-4 w-4" />
            {t('actions.disable_access')}
          </Button>
        )}
      </div>

      <InternalAccountActionDialog
        account={account}
        action={action}
        onConfirm={onConfirm}
        onOpenChange={(open) => !open && setAction(null)}
        open={action !== null}
      />
    </div>
  );
}
