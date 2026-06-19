'use client';

import { RefreshCcw } from '@tuturuuu/icons/lucide-static';
import type { WebAccountSummary } from '@tuturuuu/internal-api/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { Separator } from '@tuturuuu/ui/separator';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

const authContainerTransition = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as const,
};

export type ProfileState = 'loading' | 'ready' | 'unavailable';

export function getDisplayName({
  displayName,
  email,
  fallback,
}: {
  displayName?: string | null;
  email?: string | null;
  fallback: string;
}) {
  return displayName?.trim() || email?.trim() || fallback;
}

export function getAvatarUrl(avatarUrl?: string | null) {
  return avatarUrl?.trim() || undefined;
}

export function getInitials(value: string) {
  const initials = value
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return initials || '?';
}

export function ConfirmationCard({ children }: { children: ReactNode }) {
  return (
    <motion.div layout transition={authContainerTransition}>
      <Card className="overflow-hidden rounded-3xl border bg-background/95 shadow-2xl">
        <div className="h-1 bg-gradient-to-r from-dynamic-blue via-dynamic-green to-dynamic-red" />
        <CardContent className="space-y-6 p-6 sm:p-8">{children}</CardContent>
      </Card>
    </motion.div>
  );
}

function LoginMethodSeparator({ label }: { label: string }) {
  return (
    <div className="relative py-0.5">
      <Separator className="bg-border/60" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="bg-background/95 px-3 text-muted-foreground text-xs">
          {label}
        </span>
      </div>
    </div>
  );
}

export function ProfileLoadingState({
  appName,
  disabled,
  onUseAnotherAccount,
}: {
  appName: string;
  disabled: boolean;
  onUseAnotherAccount: () => void;
}) {
  const t = useTranslations();

  return (
    <ConfirmationCard>
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 shadow-sm">
          <LoadingIndicator className="size-5 text-dynamic-blue" />
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold text-2xl tracking-tight">
            {t('login.loading_account_profile_title')}
          </h2>
          <p className="text-balance text-muted-foreground text-sm">
            {t('login.loading_account_profile_description', { app: appName })}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
        <div className="flex animate-pulse items-center gap-3">
          <div className="size-11 rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-24 rounded-full bg-muted" />
            <div className="h-4 w-40 rounded-full bg-muted" />
            <div className="h-3 w-52 max-w-full rounded-full bg-muted" />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Button className="h-12 w-full rounded-2xl font-medium" disabled>
          <LoadingIndicator className="mr-2 size-4" />
          {t('login.loading_profile')}
        </Button>
        <Button
          className="h-11 w-full rounded-2xl"
          disabled={disabled}
          onClick={onUseAnotherAccount}
          type="button"
          variant="outline"
        >
          {t('login.use_another_account')}
        </Button>
      </div>
    </ConfirmationCard>
  );
}

export function ProfileUnavailableState({
  disabled,
  onRetryProfile,
  onUseAnotherAccount,
}: {
  disabled: boolean;
  onRetryProfile: () => void;
  onUseAnotherAccount: () => void;
}) {
  const t = useTranslations();

  return (
    <ConfirmationCard>
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-dynamic-orange/20 bg-dynamic-orange/10 shadow-sm">
          <RefreshCcw className="size-6 text-dynamic-orange" />
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold text-2xl tracking-tight">
            {t('login.profile_unavailable_title')}
          </h2>
          <p className="text-balance text-muted-foreground text-sm">
            {t('login.profile_unavailable_description')}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <Button
          className="h-12 w-full rounded-2xl font-medium"
          disabled={disabled}
          onClick={onRetryProfile}
          type="button"
        >
          <RefreshCcw className="mr-2 size-4" />
          {t('login.retry_profile_load')}
        </Button>
        <Button
          className="h-11 w-full rounded-2xl"
          disabled={disabled}
          onClick={onUseAnotherAccount}
          type="button"
          variant="outline"
        >
          {t('login.use_another_account')}
        </Button>
      </div>
    </ConfirmationCard>
  );
}

export function StoredAccountSwitchList({
  accounts,
  disabled,
  fallbackAccountName,
  onSwitchAccount,
  switchingAccountId,
}: {
  accounts: WebAccountSummary[];
  disabled: boolean;
  fallbackAccountName: string;
  onSwitchAccount: (accountId: string) => void;
  switchingAccountId: string | null;
}) {
  const t = useTranslations();

  if (accounts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <LoginMethodSeparator label={t('login.or_switch_account')} />
      <div className="space-y-2">
        {accounts.map((account) => {
          const displayName = getDisplayName({
            displayName: account.metadata.displayName,
            email: account.email,
            fallback: fallbackAccountName,
          });
          const avatarUrl = getAvatarUrl(account.metadata.avatarUrl);
          const initials = getInitials(displayName);
          const showEmail = account.email && account.email !== displayName;

          return (
            <Button
              className="h-auto min-h-11 w-full justify-start rounded-2xl px-4 py-3 text-left"
              disabled={disabled}
              key={account.id}
              onClick={() => onSwitchAccount(account.id)}
              type="button"
              variant="secondary"
            >
              {switchingAccountId === account.id ? (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background/70">
                  <LoadingIndicator className="size-4" />
                </span>
              ) : (
                <Avatar className="size-8 shrink-0">
                  <AvatarImage alt={displayName} src={avatarUrl} />
                  <AvatarFallback className="bg-foreground/10 text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {displayName}
                </span>
                {showEmail ? (
                  <span className="block truncate text-muted-foreground text-xs">
                    {account.email}
                  </span>
                ) : null}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
