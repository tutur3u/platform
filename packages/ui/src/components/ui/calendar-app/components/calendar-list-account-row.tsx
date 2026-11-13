'use client';

import { Loader2, MoreHorizontal } from '@tuturuuu/icons';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../alert-dialog';
import { Button, buttonVariants } from '../../button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../dropdown-menu';
import {
  type CalendarAccountSyncState,
  calendarAccountStatusLabelKey,
} from './calendar-account-status';

export interface CalendarListAccount {
  id: string;
  provider: string;
  account_email: string | null;
  account_name: string | null;
}

function AccountStatusDot({ state }: { state: CalendarAccountSyncState }) {
  const t = useTranslations('calendar-list');
  const label = t(calendarAccountStatusLabelKey(state));
  switch (state.kind) {
    case 'connected':
      return (
        <span
          aria-label={label}
          className="size-2 shrink-0 rounded-full bg-muted-foreground/40"
          role="img"
        />
      );
    case 'syncing':
      return (
        <span
          aria-label={label}
          className="flex size-3 shrink-0 items-center justify-center"
          role="img"
        >
          <Loader2 className="size-3 text-muted-foreground motion-safe:animate-spin" />
        </span>
      );
    case 'attention':
      return (
        <span
          aria-label={label}
          className="size-2 shrink-0 rounded-full bg-dynamic-orange"
          role="img"
        />
      );
    case 'paused':
      return (
        <span
          aria-label={label}
          className="size-2 shrink-0 rounded-full border border-muted-foreground"
          role="img"
        />
      );
    default: {
      const unhandled: never = state;
      throw new Error(
        `Unhandled calendar account state: ${JSON.stringify(unhandled)}`
      );
    }
  }
}

/**
 * An account's group header: provider glyph, email, status dot and a menu with
 * Sync now, Reconnect, Account settings and a confirmed Disconnect.
 */
export function CalendarListAccountRow({
  account,
  canSync,
  disconnecting,
  onDisconnect,
  onOpenSettings,
  onReconnect,
  onSync,
  state,
}: {
  account: CalendarListAccount;
  /** False for a quarantined account or while a manual sync cannot start. */
  canSync: boolean;
  disconnecting: boolean;
  onDisconnect: () => void;
  onOpenSettings: () => void;
  onReconnect: () => void;
  onSync: () => void;
  state: CalendarAccountSyncState;
}) {
  const t = useTranslations('calendar-list');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const name =
    account.account_email || account.account_name || t('unknown_account');

  return (
    <div className="flex h-8 items-center gap-2 rounded-md px-2">
      <Image
        alt={account.provider === 'google' ? 'Google' : 'Microsoft'}
        className="size-3.5 shrink-0"
        height={14}
        src={
          account.provider === 'google'
            ? '/media/logos/google.svg'
            : '/media/logos/microsoft.svg'
        }
        width={14}
      />
      <span
        className="min-w-0 flex-1 truncate font-medium text-muted-foreground text-xs"
        title={name}
      >
        {name}
      </span>
      <AccountStatusDot state={state} />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t('account_actions', { account: name })}
            className="size-7 shrink-0"
            size="icon"
            variant="ghost"
          >
            {disconnecting ? (
              <Loader2 className="size-4 motion-safe:animate-spin" />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!canSync} onSelect={onSync}>
            {t('sync_now')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onReconnect}>
            {t('reconnect')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenSettings}>
            {t('account_settings')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={disconnecting}
            onSelect={() => setConfirmOpen(true)}
          >
            {t('disconnect')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('disconnect_title', { account: name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('disconnect_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={onDisconnect}
            >
              {t('disconnect')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
