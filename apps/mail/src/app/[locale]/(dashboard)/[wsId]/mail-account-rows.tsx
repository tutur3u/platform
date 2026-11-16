'use client';

import { Mail, Settings, Unplug, Users } from '@tuturuuu/icons';
import type {
  ConnectedMailAccount,
  MailMailbox,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

function AccountRowLayout({
  actions,
  badges,
  icon,
  subtitle,
  title,
}: {
  actions: ReactNode;
  badges?: ReactNode;
  icon: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1 basis-40">
        <span className="block truncate font-medium text-sm">{title}</span>
        <span className="block truncate text-muted-foreground text-xs">
          {subtitle}
        </span>
      </span>
      {badges}
      <div className="flex w-full gap-2 sm:ml-auto sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
        {actions}
      </div>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full border bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
      {children}
    </span>
  );
}

export function MailboxRow({
  inUse,
  mailbox,
  onOpenSettings,
}: {
  inUse: boolean;
  mailbox: MailMailbox;
  onOpenSettings: () => void;
}) {
  const t = useTranslations('mail');
  const Icon = mailbox.type === 'shared' ? Users : Mail;
  return (
    <AccountRowLayout
      actions={
        <Button onClick={onOpenSettings} size="sm" variant="outline">
          <Settings className="size-4" />
          {t('mailbox_settings')}
        </Button>
      }
      badges={
        <>
          <Chip>
            {mailbox.type === 'shared'
              ? t('shared_mailbox')
              : t('personal_mailbox')}
          </Chip>
          {mailbox.role === 'owner' ? <Chip>{t('role_owner')}</Chip> : null}
          {mailbox.role === 'admin' ? <Chip>{t('role_admin')}</Chip> : null}
          {inUse ? <Chip>{t('in_use')}</Chip> : null}
        </>
      }
      icon={<Icon className="size-4" />}
      subtitle={mailbox.address}
      title={mailbox.displayName}
    />
  );
}

export function ConnectedAccountRow({
  account,
  confirming,
  disconnecting,
  inUse,
  onCancel,
  onConfirm,
  onRequestDisconnect,
}: {
  account: ConnectedMailAccount;
  confirming: boolean;
  disconnecting: boolean;
  inUse: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onRequestDisconnect: () => void;
}) {
  const t = useTranslations('mail');
  return (
    <div>
      <AccountRowLayout
        actions={
          <Button
            className="text-destructive"
            onClick={onRequestDisconnect}
            size="sm"
            variant="outline"
          >
            <Unplug className="size-4" />
            {t('connected_disconnect')}
          </Button>
        }
        badges={inUse ? <Chip>{t('in_use')}</Chip> : null}
        icon={<Mail className="size-4" />}
        subtitle={
          account.provider === 'google'
            ? t('provider_google')
            : t('provider_microsoft')
        }
        title={account.address}
      />
      {confirming ? (
        <div
          aria-label={t('connected_disconnect')}
          className="flex flex-wrap items-center gap-3 border-t bg-dynamic-red/5 px-4 py-3 md:px-5"
          role="group"
        >
          <p className="min-w-48 flex-1 text-sm">
            {t('connected_disconnect_confirm')}
          </p>
          <Button onClick={onCancel} size="sm" variant="outline">
            {t('connected_close')}
          </Button>
          <Button
            disabled={disconnecting}
            onClick={onConfirm}
            size="sm"
            variant="destructive"
          >
            {t('connected_disconnect')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function AccountSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex items-center gap-3 px-4 py-3 md:px-5"
    >
      <Skeleton className="size-8 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}
